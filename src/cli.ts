#!/usr/bin/env node
import { existsSync, realpathSync } from "node:fs";
import { inspect } from "node:util";
import { fileURLToPath } from "node:url";

import { scanPath } from "./scanner.js";
import type { FileReport, ScanOptions, ScanReport } from "./types.js";

const VERSION = "0.1.0";
const THRESHOLDS: Record<string, number> = { low: 20, medium: 40, high: 70 };

interface CliArgs {
  path: string;
  json: boolean;
  top: number;
  maxFileBytes: number;
  includeHidden: boolean;
  includeUnknownImports: boolean;
  failOn?: string;
  minScore?: number;
  help: boolean;
  version: boolean;
}

export function main(argv = process.argv.slice(2)): number {
  let args: CliArgs;
  try {
    args = parseArgs(argv);
  } catch (error) {
    process.stderr.write(`check-ai-slop: ${error instanceof Error ? error.message : String(error)}\n`);
    process.stderr.write("Run `check-ai-slop --help` for usage.\n");
    return 2;
  }

  if (args.help) {
    process.stdout.write(helpText());
    return 0;
  }
  if (args.version) {
    process.stdout.write(`${VERSION}\n`);
    return 0;
  }
  if (!existsSync(args.path)) {
    process.stderr.write(`check-ai-slop: cannot scan missing path: ${args.path}\n`);
    return 2;
  }

  const options: Partial<ScanOptions> = {
    maxFileBytes: args.maxFileBytes,
    includeHidden: args.includeHidden,
    includeUnknownImports: args.includeUnknownImports
  };
  let report: ScanReport;
  try {
    report = scanPath(args.path, options);
  } catch (error) {
    process.stderr.write(`check-ai-slop: ${error instanceof Error ? error.message : inspect(error)}\n`);
    return 2;
  }

  if (args.json) {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  } else {
    process.stdout.write(formatTextReport(report, Math.max(0, args.top)));
  }

  const threshold = args.minScore ?? (args.failOn ? THRESHOLDS[args.failOn] : undefined);
  return threshold !== undefined && report.score >= threshold ? 1 : 0;
}

function parseArgs(argv: readonly string[]): CliArgs {
  const args: CliArgs = {
    path: ".",
    json: false,
    top: 10,
    maxFileBytes: 2 * 1024 * 1024,
    includeHidden: false,
    includeUnknownImports: true,
    help: false,
    version: false
  };
  const positional: string[] = [];
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg) {
      continue;
    }
    if (arg === "--help" || arg === "-h") {
      args.help = true;
      continue;
    }
    if (arg === "--version" || arg === "-v") {
      args.version = true;
      continue;
    }
    if (arg === "--json") {
      args.json = true;
      continue;
    }
    if (arg === "--include-hidden") {
      args.includeHidden = true;
      continue;
    }
    if (arg === "--no-unknown-imports") {
      args.includeUnknownImports = false;
      continue;
    }
    if (arg === "--top") {
      args.top = parseInteger(readOptionValue(argv, ++index, arg), arg);
      continue;
    }
    if (arg === "--max-file-bytes") {
      args.maxFileBytes = parseInteger(readOptionValue(argv, ++index, arg), arg);
      continue;
    }
    if (arg === "--fail-on") {
      const value = readOptionValue(argv, ++index, arg);
      if (!(value in THRESHOLDS)) {
        throw new Error(`--fail-on must be one of: ${Object.keys(THRESHOLDS).join(", ")}`);
      }
      args.failOn = value;
      continue;
    }
    if (arg === "--min-score") {
      args.minScore = parseNumber(readOptionValue(argv, ++index, arg), arg);
      continue;
    }
    if (arg.startsWith("--")) {
      throw new Error(`unknown option ${arg}`);
    }
    positional.push(arg);
  }
  if (positional.length > 1) {
    throw new Error(`expected at most one path, got ${positional.length}`);
  }
  if (positional[0]) {
    args.path = positional[0];
  }
  return args;
}

function readOptionValue(argv: readonly string[], index: number, option: string): string {
  const value = argv[index];
  if (!value || value.startsWith("--")) {
    throw new Error(`${option} requires a value`);
  }
  return value;
}

function parseInteger(value: string, option: string): number {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error(`${option} must be a non-negative integer`);
  }
  return parsed;
}

function parseNumber(value: string, option: string): number {
  const parsed = Number.parseFloat(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error(`${option} must be a non-negative number`);
  }
  return parsed;
}

function helpText(): string {
  return `Usage: check-ai-slop [path] [options]

Scan a codebase for explainable, weighted AI-code/slop signals.

Options:
  --json                 Print JSON report.
  --top <n>              Max flagged files in text mode. Default: 10.
  --max-file-bytes <n>   Skip files larger than n bytes. Default: 2097152.
  --include-hidden       Include hidden files/directories except vendor/cache ignores.
  --no-unknown-imports   Disable dependency-manifest import checks.
  --fail-on <level>      Exit 1 when score reaches low, medium, or high.
  --min-score <n>        Exit 1 when score reaches numeric threshold.
  --version, -v          Print version.
  --help, -h             Print help.
`;
}

function formatTextReport(report: ScanReport, maxFiles: number): string {
  const lines: string[] = [];
  lines.push(`AI slop suspicion: ${report.confidence} (${report.score.toFixed(1)}/100)`);
  lines.push(`Scanned ${report.filesScanned} files, skipped ${report.filesSkipped}, evidence items ${report.evidenceCount}.`);
  if (report.errors.length > 0) {
    lines.push(`Read errors: ${report.errors.length}`);
  }
  if (report.files.length === 0) {
    lines.push("No AI-code/slop signals found in scanned code files.");
    lines.push("");
    return lines.join("\n");
  }

  lines.push("", "Top flagged files:");
  for (const file of report.files.slice(0, maxFiles)) {
    appendFileReport(lines, file);
  }
  if (report.files.length > maxFiles) {
    lines.push("", `${report.files.length - maxFiles} more flagged files omitted; rerun with --json or --top.`);
  }
  lines.push("");
  return lines.join("\n");
}

function appendFileReport(lines: string[], file: FileReport): void {
  lines.push(`- ${file.path}: ${file.confidence} (${file.score.toFixed(1)}/100)`);
  const categoryText = Object.entries(file.categoryScores)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${value.toFixed(1)}`)
    .join(", ");
  if (categoryText) {
    lines.push(`  categories: ${categoryText}`);
  }
  const byPattern: Record<string, typeof file.evidence> = {};
  for (const item of file.evidence) {
    const bucket = byPattern[item.patternId] ?? [];
    bucket.push(item);
    byPattern[item.patternId] = bucket;
  }
  for (const [patternId, items] of Object.entries(byPattern).slice(0, 5)) {
    const first = items[0];
    if (!first) {
      continue;
    }
    const total = items.reduce((sum, item) => sum + item.weight, 0);
    lines.push(`  - ${first.title} [${patternId}] (+${total.toFixed(1)})`);
    for (const item of items.slice(0, 2)) {
      lines.push(`    L${item.line}: ${item.excerpt}`);
    }
  }
}

const entrypoint = process.argv[1] ? realpathSync(process.argv[1]) : "";
if (fileURLToPath(import.meta.url) === entrypoint) {
  process.exitCode = main();
}
