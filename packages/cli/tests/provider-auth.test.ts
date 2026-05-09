import { expect, test } from "bun:test";
import { getProvider } from "@openseek/provider";
import { providerRequiresApiKey } from "../src/provider-auth.ts";

test("hosted providers require an API key", () => {
  const deepseek = getProvider("deepseek");
  if (!deepseek) throw new Error("missing deepseek provider");
  expect(providerRequiresApiKey(deepseek)).toBe(true);
});

test("local/self-host providers can run without an API key", () => {
  for (const id of ["ollama", "vllm", "sglang"]) {
    const provider = getProvider(id);
    if (!provider) throw new Error(`missing provider ${id}`);
    expect(providerRequiresApiKey(provider)).toBe(false);
  }
});
