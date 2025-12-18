export interface TiffHeader {
  bigTiff: boolean;
  littleEndian: boolean;
  firstIfdOffset: number | bigint;
}

export interface IfdEntry {
  tag: number;
  type: number;
  count: number | bigint;
  value: number | bigint;
}

export interface Ifd {
  offset: number | bigint;
  entries: IfdEntry[];
  nextIfdOffset: number | bigint;
}

export interface TiffStructure {
  header: TiffHeader;
  ifds: Ifd[];
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}
