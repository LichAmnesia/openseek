import { afterEach, beforeEach, expect, test } from "bun:test";
import type { LspDiagnostic, LspRouter } from "@openseek/lsp";
import lsp, { setLspRouter } from "../src/tools/lsp.ts";
import { makeCtx, makeTmpDir } from "./helpers.ts";

function fakeRouter(diags: LspDiagnostic[]): LspRouter {
  return { probe: async () => diags };
}

beforeEach(() => {
  setLspRouter(null);
});
afterEach(() => {
  setLspRouter(null);
});

test("lsp diagnostics returns formatted markdown when probe yields issues", async () => {
  setLspRouter(
    fakeRouter([
      {
        file: "src/foo.ts",
        line: 10,
        col: 5,
        severity: "error",
        message: "type mismatch",
        source: "tsc TS2322",
      },
    ]),
  );
  const result = await lsp.call(
    { op: "diagnostics", file: "src/foo.ts" },
    makeCtx(makeTmpDir("x")),
  );
  if (result.kind !== "text") throw new Error("unreachable");
  expect(result.text).toContain("**LSP** (1 issue in src/foo.ts)");
  expect(result.text).toContain("L10:5 error tsc TS2322: type mismatch");
});

test("lsp diagnostics with empty probe returns 'no diagnostics' note", async () => {
  setLspRouter(fakeRouter([]));
  const result = await lsp.call(
    { op: "diagnostics", file: "src/clean.ts" },
    makeCtx(makeTmpDir("x")),
  );
  if (result.kind !== "text") throw new Error("unreachable");
  expect(result.text).toContain("no diagnostics for src/clean.ts");
});

test("lsp hover stays stubbed for v0.4", async () => {
  const result = await lsp.call(
    { op: "hover", file: "src/x.ts", line: 1, col: 1 },
    makeCtx(makeTmpDir("x")),
  );
  if (result.kind !== "text") throw new Error("unreachable");
  expect(result.text).toContain("not yet implemented");
  expect(result.text).toContain("hover");
});

test("lsp definition stays stubbed for v0.4", async () => {
  const result = await lsp.call(
    { op: "definition", file: "src/x.ts", line: 1, col: 1 },
    makeCtx(makeTmpDir("x")),
  );
  if (result.kind !== "text") throw new Error("unreachable");
  expect(result.text).toContain("not yet implemented");
});

test("lsp rename without newName errors (stub guard preserved)", async () => {
  const result = await lsp.call(
    { op: "rename", file: "src/x.ts", line: 1, col: 1 },
    makeCtx(makeTmpDir("x")),
  );
  expect(result.kind).toBe("error");
});
