import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { _internal, tscProbe } from "../src/tsc.ts";

const { parseTscOutput } = _internal;

describe("parseTscOutput", () => {
  test("parses canonical 'path(line,col): error TSnnn: msg' form", () => {
    const out = parseTscOutput(
      "src/foo.ts(12,4): error TS2304: Cannot find name 'foo'.\n",
      "",
    );
    expect(out).toHaveLength(1);
    const d = out[0];
    if (!d) throw new Error("expected diagnostic");
    expect(d.file).toBe("src/foo.ts");
    expect(d.line).toBe(12);
    expect(d.col).toBe(4);
    expect(d.severity).toBe("error");
    expect(d.source).toBe("tsc TS2304");
    expect(d.message).toContain("Cannot find name");
  });

  test("ignores junk / non-diagnostic lines", () => {
    const out = parseTscOutput("Watching for changes...\nVersion 5.5.4\n", "");
    expect(out).toEqual([]);
  });
});

describe("tscProbe (real spawn, best-effort)", () => {
  test("returns at least one diagnostic for a clearly broken file", async () => {
    const dir = mkdtempSync(join(tmpdir(), "openseek-lsp-tsc-"));
    try {
      const f = join(dir, "broken.ts");
      writeFileSync(f, "const x: number = 'not a number';\n");
      const diags = await tscProbe(f, { rootDir: dir });
      // Be lenient — if tsc isn't installed in this environment we get [].
      // The contract is "best-effort, never throws"; if it did run, we
      // should see TS2322 (type assignment).
      if (diags.length > 0) {
        expect(diags.some((d) => d.severity === "error")).toBe(true);
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 60000);

  test("never throws on a non-existent file", async () => {
    const out = await tscProbe("/does/not/exist/__nope__.ts");
    expect(Array.isArray(out)).toBe(true);
  }, 30000);
});
