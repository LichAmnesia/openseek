import { describe, expect, test } from "bun:test";
import { formatDiagnostics, type LspDiagnostic } from "../src/index.ts";

describe("formatDiagnostics", () => {
  test("empty input returns empty string", () => {
    expect(formatDiagnostics([])).toBe("");
  });

  test("single file renders header + bullet with source label", () => {
    const out = formatDiagnostics([
      {
        file: "src/foo.ts",
        line: 12,
        col: 4,
        severity: "error",
        message: "cannot find name 'foo'",
        source: "tsc TS2304",
      },
    ]);
    expect(out).toContain("**LSP** (1 issue in src/foo.ts):");
    expect(out).toContain("L12:4 error tsc TS2304: cannot find name 'foo'");
  });

  test("multi-file output sorts severity error → warning → info per file", () => {
    const diags: LspDiagnostic[] = [
      { file: "a.ts", line: 1, col: 1, severity: "info", message: "a-info" },
      { file: "a.ts", line: 2, col: 1, severity: "error", message: "a-err" },
      { file: "a.ts", line: 3, col: 1, severity: "warning", message: "a-warn" },
      { file: "b.ts", line: 5, col: 2, severity: "warning", message: "b-warn" },
    ];
    const out = formatDiagnostics(diags);
    const aChunk = out.split("**LSP**")[1] ?? ""; // first file section
    // Within a.ts, error must come before warn before info.
    const errIdx = aChunk.indexOf("a-err");
    const warnIdx = aChunk.indexOf("a-warn");
    const infoIdx = aChunk.indexOf("a-info");
    expect(errIdx).toBeGreaterThan(-1);
    expect(warnIdx).toBeGreaterThan(errIdx);
    expect(infoIdx).toBeGreaterThan(warnIdx);
    expect(out).toContain("(1 issue in b.ts)");
  });

  test("truncates per-file at maxPerFile and notes the count", () => {
    const diags: LspDiagnostic[] = Array.from({ length: 8 }, (_, i) => ({
      file: "many.ts",
      line: i + 1,
      col: 1,
      severity: "error" as const,
      message: `m${i}`,
    }));
    const out = formatDiagnostics(diags, 3);
    expect(out).toContain("(8 issues in many.ts)");
    expect(out).toContain("…5 more truncated");
    // Only first 3 messages should appear in the bullet block.
    expect(out).toContain("m0");
    expect(out).toContain("m2");
    expect(out).not.toContain("m3");
  });
});
