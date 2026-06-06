import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import assert from "node:assert/strict";

import { scanPath } from "../src/scanner.js";

function withTempDir(callback: (directory: string) => void): void {
  const directory = mkdtempSync(join(tmpdir(), "check-ai-slop-"));
  try {
    callback(directory);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

test("detects the referenced was-gpt-here TypeScript helper", () => {
  withTempDir((directory) => {
    writeFileSync(
      join(directory, "match.ts"),
      `function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
`
    );

    const report = scanPath(directory, { includeUnknownImports: false });

    assert.equal(report.filesScanned, 1);
    assert.equal(report.confidence, "low");
    assert.ok(report.score >= 20);
    assert.equal(report.files[0]?.evidence[0]?.patternId, "ts_exact_is_record_guard");
  });
});

test("keeps small clean human code clean", () => {
  withTempDir((directory) => {
    writeFileSync(
      join(directory, "math.ts"),
      `export function add(left: number, right: number): number {
  return left + right;
}
`
    );

    const report = scanPath(directory, { includeUnknownImports: false });

    assert.equal(report.filesScanned, 1);
    assert.equal(report.score, 0);
    assert.equal(report.confidence, "clean");
    assert.deepEqual(report.files, []);
  });
});

test("scores clustered AI provenance, defensive code, and placeholder slop as high", () => {
  withTempDir((directory) => {
    writeFileSync(
      join(directory, "generated.ts"),
      `// Created using GPT-5.5
// Replace with your actual endpoint URL

export function processUserDataResponse(input: unknown): string {
  /** This function processes user data.
   * Args: input data
   * Returns: processed data
   */
  if (input === null) throw new Error("The provided input cannot be empty");
  if (input === undefined) throw new Error("The provided input is not in a valid format");
  if (typeof input !== "object") throw new Error("The specified input is not in a valid format");
  return JSON.stringify(input);
}

export function handleUserDataResponse(value: unknown): string {
  if (value === null) return "";
  return processUserDataResponse(value);
}

export function validateUserDataInput(value: unknown): boolean {
  if (value === null) return false;
  if (value === undefined) return false;
  return true;
}

export function formatUserDataOutput(value: string): string {
  return value.trim();
}
`
    );

    const report = scanPath(directory, { includeUnknownImports: false });
    const patternIds = new Set(report.files[0]?.evidence.map((item) => item.patternId));

    assert.equal(report.confidence, "high");
    assert.ok(report.score >= 70, `score was ${report.score}`);
    assert.ok(patternIds.has("self_admitted_ai_comment"));
    assert.ok(patternIds.has("template_customization_comment"));
    assert.ok(patternIds.has("null_guard_cluster"));
  });
});

test("reports hallucination-risk imports against package manifests", () => {
  withTempDir((directory) => {
    writeFileSync(join(directory, "package.json"), JSON.stringify({ dependencies: { react: "latest" } }));
    writeFileSync(
      join(directory, "widget.ts"),
      `import React from 'react';
import { makeWidget } from 'plausible-widget-utils';

export function Widget() {
  return makeWidget(React.createElement('div'));
}
`
    );

    const report = scanPath(directory);
    const patternIds = new Set(report.files.flatMap((file) => file.evidence.map((item) => item.patternId)));

    assert.ok(patternIds.has("unknown_dependency_reference"));
    assert.ok(patternIds.has("plausible_generic_package_name"));
  });
});

test("CLI emits JSON and fail-on low exits with status 1", () => {
  withTempDir((directory) => {
    writeFileSync(
      join(directory, "match.ts"),
      `function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
`
    );

    let output = "";
    assert.throws(
      () => {
        output = execFileSync(process.execPath, ["dist/cli.js", directory, "--json", "--no-unknown-imports", "--fail-on", "low"], {
          encoding: "utf8"
        });
      },
      (error: unknown) => {
        if (typeof error !== "object" || error === null || !("stdout" in error)) {
          return false;
        }
        output = String((error as { stdout: unknown }).stdout);
        return true;
      }
    );

    const payload = JSON.parse(output) as { confidence: string; files: Array<{ evidence: Array<{ patternId: string }> }> };
    assert.equal(payload.confidence, "low");
    assert.equal(payload.files[0]?.evidence[0]?.patternId, "ts_exact_is_record_guard");
  });
});
