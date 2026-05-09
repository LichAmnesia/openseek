// e2e: RLM fan-out (G7.2 #8).

import { describe, expect, test } from "bun:test";
import { runRlm, type RlmRunner } from "@openseek/agent";

describe("e2e: RLM flow", () => {
  test("16-query fan-out with bounded parallelism preserves order", async () => {
    const runner: RlmRunner = async (query) => `r:${query}`;
    const queries = Array.from({ length: 16 }, (_, i) => `q${i}`);
    const out = await runRlm(queries, { runner, maxParallel: 4 });
    expect(out).toHaveLength(16);
    expect(out[0]?.response).toBe("r:q0");
    expect(out[15]?.response).toBe("r:q15");
    expect(out.every((r) => r.ms >= 0)).toBe(true);
  });

  test("a single failing worker is isolated to its slot — does not poison the batch", async () => {
    const runner: RlmRunner = async (query) => {
      if (query === "bad") throw new Error("boom");
      return `ok:${query}`;
    };
    const out = await runRlm(["a", "bad", "c"], { runner });
    expect(out[0]?.response).toBe("ok:a");
    expect(out[1]?.response.startsWith("[error")).toBe(true);
    expect(out[2]?.response).toBe("ok:c");
  });
});
