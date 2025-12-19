import { parseTiff } from "./tiff-parser";
import { validate } from "./validator";

/**
 * CLI exit codes following Unix conventions.
 */
const ExitCode = {
  Valid: 0,
  Invalid: 1,
  Error: 2,
} as const;

/**
 * Prints usage information to stdout.
 */
function printUsage(): void {
  console.log(
    `
cog-validate - Validate Cloud Optimized GeoTIFF files

Usage:
  cog-validate <file>
  cog-validate <file> --json
  cog-validate <file> --verbose

Options:
  --json      Output results as JSON
  --verbose   Show detailed validation information
  --help      Show this help message

Exit codes:
  0  Valid COG
  1  Invalid COG
  2  Error (file not found, not a TIFF, etc.)
`.trim(),
  );
}

/**
 * Parses command line arguments.
 *
 * @param args - Raw arguments from Bun.argv
 * @returns Parsed options and file path
 */
function parseArgs(args: string[]): {
  file: string | null;
  json: boolean;
  verbose: boolean;
  help: boolean;
} {
  // Bun.argv: [bun, script.ts, ...userArgs]
  const userArgs = args.slice(2);

  return {
    file: userArgs.find((arg) => !arg.startsWith("--")) ?? null,
    json: userArgs.includes("--json"),
    verbose: userArgs.includes("--verbose"),
    help: userArgs.includes("--help"),
  };
}

/**
 * Main entry point for the CLI.
 *
 * Reads a TIFF file, parses its structure, validates COG compliance,
 * and outputs results to stdout.
 */
async function main(): Promise<void> {
  const args = parseArgs(Bun.argv);

  if (args.help) {
    printUsage();
    process.exit(ExitCode.Valid);
  }

  if (!args.file) {
    console.error("Error: No file specified\n");
    printUsage();
    process.exit(ExitCode.Error);
  }

  // Check file exists
  const file = Bun.file(args.file);
  const exists = await file.exists();

  if (!exists) {
    console.error(`Error: File not found: ${args.file}`);
    process.exit(ExitCode.Error);
  }

  // Read and parse
  let buffer: ArrayBuffer;
  try {
    buffer = await file.arrayBuffer();
  } catch (err) {
    console.error(`Error: Could not read file: ${args.file}`);
    process.exit(ExitCode.Error);
  }

  let structure;
  try {
    structure = parseTiff(buffer);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    if (args.json) {
      console.log(JSON.stringify({ valid: false, error: message }, null, 2));
    } else {
      console.error(`Error: ${message}`);
    }
    process.exit(ExitCode.Error);
  }

  // Validate
  const result = validate(structure);

  // Output
  if (args.json) {
    console.log(JSON.stringify(result, null, 2));
  } else if (args.verbose) {
    console.log(`File: ${args.file}`);
    console.log(
      `Format: ${structure.header.bigTiff ? "BigTIFF" : "Classic TIFF"}`,
    );
    console.log(
      `Endianness: ${structure.header.littleEndian ? "Little" : "Big"}`,
    );
    console.log(`IFDs: ${structure.ifds.length}`);
    console.log("");

    if (result.valid) {
      console.log("✓ Valid COG");
    } else {
      console.log("✗ Invalid COG");
    }

    if (result.errors.length > 0) {
      console.log("\nErrors:");
      result.errors.forEach((e) => console.log(`  - ${e}`));
    }

    if (result.warnings.length > 0) {
      console.log("\nWarnings:");
      result.warnings.forEach((w) => console.log(`  - ${w}`));
    }
  } else {
    // Default: simple output
    if (result.valid) {
      console.log(`✓ ${args.file} is a valid COG`);
    } else {
      console.log(`✗ ${args.file} is not a valid COG`);
      result.errors.forEach((e) => console.log(`  ${e}`));
    }
  }

  process.exit(result.valid ? ExitCode.Valid : ExitCode.Invalid);
}

// Run it
main();
