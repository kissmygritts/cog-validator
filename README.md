# cog-validator

A simple, fast Cloud Optimized GeoTIFF (COG) validator with no geospatial dependencies.

> 🏗️ **Work in progress** - This tool is in active development 🏗️

## Goals

- Single binary, no runtime dependencies
- Fast validation without loading image data
- No GDAL, rasterio, or other geospatial libraries required

## Limitations

This is an intentionally minimal validator. It checks basic COG structure but makes assumptions and skips checks that a comprehensive validator would perform.

**What it checks:**

- Valid TIFF/BigTIFF file structure
- Images are tiled (not stripped)
- IFDs appear before tile data

**What it doesn't check:**

- Tile data ordering (overviews before full resolution)
- Actual tile byte offsets (only checks pointer location)
- GeoTIFF metadata validity
- Compression settings
- Tile size recommendations

For comprehensive validation, use [GDAL's validate_cloud_optimized_geotiff.py](https://github.com/OSGeo/gdal/blob/master/swig/python/gdal-utils/osgeo_utils/samples/validate_cloud_optimized_geotiff.py).

## Usage
```bash
cog-validate 
cog-validate  --json
cog-validate  --verbose
```

## Building

Requires [Bun](https://bun.sh).
```bash
bun install
bun build src/index.ts --compile --outfile cog-validate
