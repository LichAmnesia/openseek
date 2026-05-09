import { describe, expect, test } from "bun:test";
import { createLspRouter, type LspDiagnostic, type LspProbe } from "../src/index.ts";

function fakeProbe(diags: LspDiagnostic[]): LspProbe {
  return async () => diags;
}

describe("createLspRouter", () => {
  test("routes .ts to the tsc probe", async () => {
    const tsc = fakeProbe([
      { file: "x.ts", line: 1, col: 1, severity: "error", message: "boom" },
    ]);
    const router = createLspRouter({ tsc });
    const out = await router.probe("x.ts");
    expect(out).toHaveLength(1);
    expect(out[0]?.message).toBe("boom");
  });

  test("routes other JS family extensions to tsc probe too", async () => {
    let calls = 0;
    const tsc: LspProbe = async () => {
      calls += 1;
      return [];
    };
    const router = createLspRouter({ tsc });
    for (const f of ["a.tsx", "b.js", "c.jsx", "d.mjs", "e.cjs"]) {
      await router.probe(f);
    }
    expect(calls).toBe(5);
  });

  test("reserved (.py / .go / .rs) extensions resolve to []", async () => {
    const router = createLspRouter({
      tsc: async () => [
        { file: "x", line: 1, col: 1, severity: "error", message: "should not see" },
      ],
    });
    for (const f of ["a.py", "b.go", "c.rs", "d.cpp"]) {
      const out = await router.probe(f);
      expect(out).toEqual([]);
    }
  });

  test("DI: a probe that throws is swallowed and resolves to []", async () => {
    const router = createLspRouter({
      tsc: async () => {
        throw new Error("boom");
      },
    });
    const out = await router.probe("x.ts");
    expect(out).toEqual([]);
  });
});
