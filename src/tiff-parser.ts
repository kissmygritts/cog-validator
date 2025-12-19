import type { TiffHeader, Ifd, IfdEntry, TiffStructure } from "./types";

/**
 * TIFF tag data types and their sizes in bytes.
 *
 * Used to calculate how many bytes a tag's value occupies,
 * which determines whether the value fits inline in the IFD
 * entry or requires an offset to elsewhere in the file.
 */
const TAG_TYPE_SIZES: Record<number, number> = {
  1: 1, // BYTE
  2: 1, // ASCII
  3: 2, // SHORT
  4: 4, // LONG
  5: 8, // RATIONAL (two LONGs)
  6: 1, // SBYTE
  7: 1, // UNDEFINED
  8: 2, // SSHORT
  9: 4, // SLONG
  10: 8, // SRATIONAL
  11: 4, // FLOAT
  12: 8, // DOUBLE
  // BigTIFF additions
  16: 8, // LONG8
  17: 8, // SLONG8
  18: 8, // IFD8
};

/**
 * Parses the TIFF header from a DataView.
 *
 * Reads the byte order marker, magic number, and offset to the first IFD.
 * Supports both classic TIFF and BigTIFF formats.
 *
 * @param view - DataView wrapping the TIFF file buffer
 * @returns Parsed header containing endianness, format, and first IFD offset
 * @throws Error if byte order marker or magic number is invalid
 *
 * @example
 * ```typescript
 * const buffer = await Bun.file("image.tif").arrayBuffer();
 * const view = new DataView(buffer);
 * const header = parseHeader(view);
 * console.log(header.bigTiff); // false for classic TIFF
 * ```
 */
export function parseHeader(view: DataView): TiffHeader {
  // Bytes 0-1: Byte order marker
  // 0x4949 = "II" = Intel = little-endian
  // 0x4D4D = "MM" = Motorola = big-endian
  const byteOrder = view.getUint16(0, false);

  if (byteOrder !== 0x4949 && byteOrder !== 0x4d4d) {
    throw new Error("Not a valid TIFF file: bad byte order marker");
  }

  const littleEndian = byteOrder === 0x4949;

  // Bytes 2-3: Magic number
  // 42 = classic TIFF
  // 43 = BigTIFF
  const magic = view.getUint16(2, littleEndian);
  if (magic !== 42 && magic !== 43) {
    throw new Error(`Not a valid TIFF file: bad magic number ${magic}`);
  }

  const bigTiff = magic === 43;

  let firstIfdOffset: number | bigint;
  if (bigTiff) {
    // BigTIFF has additional fields at bytes 4-7, then offset at bytes 8-15
    firstIfdOffset = view.getBigUint64(8, littleEndian);
  } else {
    // Classic TIFF: offset at bytes 4-7
    firstIfdOffset = view.getUint32(4, littleEndian);
  }

  return { bigTiff, littleEndian, firstIfdOffset };
}

/**
 * Parses a single IFD (Image File Directory) at the given offset.
 *
 * An IFD contains metadata for one image in the TIFF. Each entry
 * describes a tag: its ID, data type, value count, and either the
 * value itself (if small enough) or an offset to the value.
 *
 * @param view - DataView wrapping the TIFF file buffer
 * @param offset - Byte offset where this IFD begins
 * @param header - Parsed TIFF header for endianness and format info
 * @returns Parsed IFD with entries and pointer to next IFD
 *
 * @example
 * ```typescript
 * const header = parseHeader(view);
 * const ifd = parseIfd(view, header.firstIfdOffset, header);
 * console.log(ifd.entries.length); // number of tags in this image
 * ```
 */
export function parseIfd(
  view: DataView,
  offset: number | bigint,
  header: TiffHeader,
): Ifd {
  const { littleEndian, bigTiff } = header;

  let pos = Number(offset);
  let entryCount: number;
  if (bigTiff) {
    entryCount = Number(view.getBigUint64(pos, littleEndian));
    pos += 8;
  } else {
    entryCount = view.getUint16(pos, littleEndian);
    pos += 2;
  }

  const entries: IfdEntry[] = [];
  for (let i = 0; i < entryCount; i++) {
    const entry = parseIfdEntry(view, pos, header);
    entries.push(entry);
    pos += bigTiff ? 20 : 12;
  }

  let nextIfdOffset: number | bigint;
  if (bigTiff) {
    nextIfdOffset = view.getBigUint64(pos, littleEndian);
  } else {
    nextIfdOffset = view.getUint32(pos, littleEndian);
  }

  return { offset, entries, nextIfdOffset };
}

/**
 * Parses a single IFD entry (tag) at the given offset.
 *
 * Each entry contains:
 * - Tag ID (what kind of metadata)
 * - Data type (how to interpret bytes)
 * - Count (how many values)
 * - Value or offset (the data itself, or where to find it)
 *
 * @param view - DataView wrapping the TIFF file buffer
 * @param offset - Byte offset where this entry begins
 * @param header - Parsed TIFF header for endianness and format info
 * @returns Parsed entry with tag, type, count, and value/offset
 */
function parseIfdEntry(
  view: DataView,
  offset: number,
  header: TiffHeader,
): IfdEntry {
  const { littleEndian, bigTiff } = header;
  const tag = view.getUint16(offset, littleEndian);
  const type = view.getUint16(offset + 2, littleEndian);

  let count: number | bigint;
  let value: number | bigint;
  if (bigTiff) {
    count = view.getBigUint64(offset + 4, littleEndian);
    value = view.getBigUint64(offset + 12, littleEndian);
  } else {
    count = view.getUint32(offset + 4, littleEndian);
    value = view.getUint32(offset + 8, littleEndian);
  }

  return { tag, type, count, value };
}

/**
 * Parses all IFDs in a TIFF file by following the linked list.
 *
 * TIFF files store images as a chain of IFDs. The header points to
 * the first IFD, each IFD points to the next, and the last IFD
 * has a next offset of zero.
 *
 * For a COG, the first IFD is the full resolution image, followed
 * by overviews in decreasing resolution order.
 *
 * @param view - DataView wrapping the TIFF file buffer
 * @param header - Parsed TIFF header containing first IFD offset
 * @returns Array of all IFDs in file order
 * @throws Error if IFD chain is circular or exceeds reasonable depth
 *
 * @example
 * ```typescript
 * const header = parseHeader(view);
 * const ifds = parseAllIfds(view, header);
 * console.log(`Found ${ifds.length} images (1 main + ${ifds.length - 1} overviews)`);
 * ```
 */
export function parseAllIfds(view: DataView, header: TiffHeader): Ifd[] {
  const ifds: Ifd[] = [];
  const seenOffsets = new Set<bigint>();

  // prevent infinite loops on malformed files
  const MAX_IFDS = 1000;

  let currentOffset = header.firstIfdOffset;
  while (currentOffset !== 0 && currentOffset !== 0n) {
    if (ifds.length >= MAX_IFDS) {
      throw new Error(
        `Esceeded maximum IFD count (${MAX_IFDS}), file may be malformed`,
      );
    }

    const offsetKey = BigInt(currentOffset);
    if (seenOffsets.has(offsetKey)) {
      throw new Error(
        `Circular IFD reference detected at offset ${currentOffset}`,
      );
    }
    seenOffsets.add(offsetKey);

    const ifd = parseIfd(view, currentOffset, header);
    ifds.push(ifd);

    currentOffset = ifd.nextIfdOffset;
  }

  return ifds;
}

/**
 * Parses the complete structure of a TIFF file.
 *
 * This is the main entry point for parsing. It reads the header
 * and all IFDs, returning a complete representation of the file's
 * structure for validation.
 *
 * @param buffer - Raw bytes of the TIFF file
 * @returns Complete parsed structure including header and all IFDs
 * @throws Error if file is not a valid TIFF
 *
 * @example
 * ```typescript
 * const buffer = await Bun.file("image.tif").arrayBuffer();
 * const structure = parseTiff(buffer);
 * console.log(`BigTIFF: ${structure.header.bigTiff}`);
 * console.log(`IFDs: ${structure.ifds.length}`);
 * ```
 */
export function parseTiff(buffer: ArrayBuffer): TiffStructure {
  const view = new DataView(buffer);
  const header = parseHeader(view);
  const ifds = parseAllIfds(view, header);

  return { header, ifds };
}
