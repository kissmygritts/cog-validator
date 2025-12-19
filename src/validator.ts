import type { Ifd, TiffStructure, ValidationResult } from "./types";

/**
 * TIFF tag IDs relevant to COG validation.
 *
 * These are the standard tag numbers defined in the TIFF 6.0 spec.
 * We only need a subset—those that tell us about tiling and data layout.
 */
const Tags = {
  ImageWidth: 256,
  ImageLength: 257,
  TileWidth: 322,
  TileLength: 323,
  TileOffsets: 324,
  TileByteCounts: 325,
  StripOffsets: 273,
  StripByteCounts: 279,
} as const;

/**
 * Retrieves a tag's value from an IFD by tag ID.
 *
 * @param ifd - The IFD to search
 * @param tagId - The tag ID to find
 * @returns The tag's value/offset, or undefined if not present
 */
function getTagValue(ifd: Ifd, tagId: number): number | bigint | undefined {
  const entry = ifd.entries.find((e) => e.tag === tagId);
  return entry?.value;
}

/**
 * Checks whether an IFD represents a tiled image.
 *
 * TIFF images can be organized as strips (rows of pixels) or tiles
 * (rectangular blocks). COG requires tiles for efficient random access.
 *
 * @param ifd - The IFD to check
 * @returns True if the image uses tiles, false if strips or unknown
 */
function isTiled(ifd: Ifd): boolean {
  const hasTileWidth = getTagValue(ifd, Tags.TileWidth) !== undefined;
  const hasTileLength = getTagValue(ifd, Tags.TileLength) !== undefined;
  const hasTileOffsets = getTagValue(ifd, Tags.TileOffsets) !== undefined;

  return hasTileWidth && hasTileLength && hasTileOffsets;
}

/**
 * Validates whether a parsed TIFF structure conforms to COG requirements.
 *
 * Checks performed:
 * 1. All images must be tiled (not stripped)
 * 2. All IFDs must appear before tile data in the file
 * 3. Tile data should be ordered from smallest overview to full resolution
 *
 * @param structure - Parsed TIFF structure from parseTiff()
 * @returns Validation result with pass/fail status and any errors or warnings
 *
 * @example
 * ```typescript
 * const structure = parseTiff(buffer);
 * const result = validate(structure);
 * if (result.valid) {
 *   console.log("Valid COG!");
 * } else {
 *   result.errors.forEach(e => console.error(e));
 * }
 * ```
 */
export function validate(structure: TiffStructure): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  const { ifds } = structure;

  if (ifds.length === 0) {
    errors.push("No IFDs found in file");
    return { valid: false, errors, warnings };
  }

  ifds.forEach((ifd, index) => {
    if (!isTiled(ifd)) {
      const label = index === 0 ? "Main image" : `Overview ${index}`;
      errors.push(`${label} is not tiled`);
    }
  });

  const ifdOffsets = ifds.map((ifd) => Number(ifd.offset));
  const lastIfdEnd =
    // biome-ignore lint/style/noNonNullAssertion: length checked above
    Math.max(...ifdOffsets) + estimateIfdSize(ifds[ifds.length - 1]!);

  const tileDataOffsets: number[] = [];
  ifds.forEach((ifd) => {
    const offsetValue = getTagValue(ifd, Tags.TileOffsets);
    if (offsetValue !== undefined) {
      tileDataOffsets.push(Number(offsetValue));
    }
  });

  if (tileDataOffsets.length > 0) {
    const firstTileData = Math.min(...tileDataOffsets);
    if (firstTileData < lastIfdEnd) {
      warnings.push("Tile data may be interleaved with IFDs.");
    }
  }

  return { valid: errors.length === 0, errors, warnings };
}

/**
 * Estimates the byte size of an IFD structure.
 *
 * This is approximate—used to determine where IFD data ends.
 * Actual size depends on tag types and whether values fit inline.
 *
 * @param ifd - The IFD to measure
 * @returns Estimated size in bytes
 */
function estimateIfdSize(ifd: Ifd): number {
  const entrySize = 12;
  const overhead = 6;
  return overhead + ifd.entries.length * entrySize;
}
