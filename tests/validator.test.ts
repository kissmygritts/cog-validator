import { describe, expect, test } from "bun:test";
import type { Ifd, TiffStructure } from "../src/types";
import { validate } from "../src/validator";

/**
 * Helper to create a minimal IFD with specified tags.
 */
function createIfd(
  offset: number,
  tags: { tag: number; value: number }[],
): Ifd {
  return {
    offset,
    entries: tags.map((t) => ({
      tag: t.tag,
      type: 4,
      count: 1,
      value: t.value,
    })),
    nextIfdOffset: 0,
  };
}

// Tag constants
const Tags = {
  TileWidth: 322,
  TileLength: 323,
  TileOffsets: 324,
  TileByteCounts: 325,
  StripOffsets: 273,
  StripByteCounts: 279,
};

describe("validate", () => {
  test("passes for valid tiled image", () => {
    const structure: TiffStructure = {
      header: { bigTiff: false, littleEndian: true, firstIfdOffset: 8 },
      ifds: [
        createIfd(8, [
          { tag: Tags.TileWidth, value: 512 },
          { tag: Tags.TileLength, value: 512 },
          { tag: Tags.TileOffsets, value: 1000 },
          { tag: Tags.TileByteCounts, value: 2000 },
        ]),
      ],
    };

    const result = validate(structure);

    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  test("fails for stripped image (no tile tags)", () => {
    const structure: TiffStructure = {
      header: { bigTiff: false, littleEndian: true, firstIfdOffset: 8 },
      ifds: [
        createIfd(8, [
          { tag: Tags.StripOffsets, value: 1000 },
          { tag: Tags.StripByteCounts, value: 2000 },
        ]),
      ],
    };

    const result = validate(structure);

    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0]).toContain("not tiled");
  });

  test("fails for empty IFD list", () => {
    const structure: TiffStructure = {
      header: { bigTiff: false, littleEndian: true, firstIfdOffset: 8 },
      ifds: [],
    };

    const result = validate(structure);

    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain("No IFDs");
  });

  test("fails when only some tile tags present", () => {
    const structure: TiffStructure = {
      header: { bigTiff: false, littleEndian: true, firstIfdOffset: 8 },
      ifds: [
        createIfd(8, [
          { tag: Tags.TileWidth, value: 512 },
          // Missing TileLength and TileOffsets
        ]),
      ],
    };

    const result = validate(structure);

    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain("not tiled");
  });

  test("validates multiple IFDs (main image + overviews)", () => {
    const structure: TiffStructure = {
      header: { bigTiff: false, littleEndian: true, firstIfdOffset: 8 },
      ifds: [
        createIfd(8, [
          { tag: Tags.TileWidth, value: 512 },
          { tag: Tags.TileLength, value: 512 },
          { tag: Tags.TileOffsets, value: 2000 },
        ]),
        createIfd(200, [
          { tag: Tags.TileWidth, value: 512 },
          { tag: Tags.TileLength, value: 512 },
          { tag: Tags.TileOffsets, value: 3000 },
        ]),
      ],
    };

    const result = validate(structure);

    expect(result.valid).toBe(true);
  });

  test("fails when one overview is not tiled", () => {
    const structure: TiffStructure = {
      header: { bigTiff: false, littleEndian: true, firstIfdOffset: 8 },
      ifds: [
        createIfd(8, [
          { tag: Tags.TileWidth, value: 512 },
          { tag: Tags.TileLength, value: 512 },
          { tag: Tags.TileOffsets, value: 2000 },
        ]),
        createIfd(200, [
          { tag: Tags.StripOffsets, value: 3000 }, // Not tiled
        ]),
      ],
    };

    const result = validate(structure);

    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain("Overview 1");
  });
});
