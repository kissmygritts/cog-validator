import { describe, expect, test } from "bun:test";
import { parseHeader } from "../src/tiff-parser";

describe("parseHeader", () => {
  test("parses little-endian classic TIFF header", () => {
    const bytes = new Uint8Array([
      // "II" - little endian
      0x49, 0x49,
      // 42 - TIFF magic
      0x2a, 0x00,
      // 8 - first IFD offset
      0x08, 0x00, 0x00, 0x00,
    ]);

    const view = new DataView(bytes.buffer);
    const header = parseHeader(view);

    expect(header.littleEndian).toBe(true);
    expect(header.bigTiff).toBe(false);
    expect(header.firstIfdOffset).toBe(8);
  });

  test("parses big-endian classic TIFF header", () => {
    const bytes = new Uint8Array([
      // "MM" - big endian
      0x4d, 0x4d,
      // 42 - TIFF magic (big endian)
      0x00, 0x2a,
      // 8 - first IFD offset (big endian)
      0x00, 0x00, 0x00, 0x08,
    ]);

    const view = new DataView(bytes.buffer);
    const header = parseHeader(view);

    expect(header.littleEndian).toBe(false);
    expect(header.bigTiff).toBe(false);
    expect(header.firstIfdOffset).toBe(8);
  });

  test("parses little-endian BigTIFF header", () => {
    const bytes = new Uint8Array([
      // "II" - little endian
      0x49, 0x49,
      // 43 - BigTIFF magic
      0x2b, 0x00,
      // 8 - byte size of offsets
      0x08, 0x00,
      // padding
      0x00, 0x00,
      // 16 - first IFD offset (64-bit)
      0x10, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    ]);

    const view = new DataView(bytes.buffer);
    const header = parseHeader(view);

    expect(header.littleEndian).toBe(true);
    expect(header.bigTiff).toBe(true);
    expect(header.firstIfdOffset).toBe(16n); // bigint
  });

  test("throws on invalid byte order marker", () => {
    const bytes = new Uint8Array([
      // invalid byte order
      0x00, 0x00, 0x2a, 0x00, 0x08, 0x00, 0x00, 0x00,
    ]);

    const view = new DataView(bytes.buffer);

    expect(() => parseHeader(view)).toThrow("bad byte order marker");
  });

  test("throws on invalid magic number", () => {
    const bytes = new Uint8Array([
      // valid byte order
      0x49, 0x49,
      // invalid magic
      0x00, 0x00, 0x08, 0x00, 0x00, 0x00,
    ]);

    const view = new DataView(bytes.buffer);

    expect(() => parseHeader(view)).toThrow("bad magic number");
  });

  test("throws on non-TIFF file", () => {
    // PNG header
    const bytes = new Uint8Array([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    ]);

    const view = new DataView(bytes.buffer);

    expect(() => parseHeader(view)).toThrow();
  });
});
