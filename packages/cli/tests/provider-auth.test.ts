import { expect, test } from "bun:test";
import { getProvider } from "@openseek/provider";
import {
  missingBaseURLMessage,
  providerRequiresApiKey,
  providerRequiresBaseURL,
} from "../src/provider-auth.ts";

test("hosted providers require an API key", () => {
  const deepseek = getProvider("deepseek");
  if (!deepseek) throw new Error("missing deepseek provider");
  expect(providerRequiresApiKey(deepseek)).toBe(true);
});

test("local/self-host providers can run without an API key", () => {
  for (const id of ["ollama", "vllm", "sglang", "custom"]) {
    const provider = getProvider(id);
    if (!provider) throw new Error(`missing provider ${id}`);
    expect(providerRequiresApiKey(provider)).toBe(false);
  }
});

// G8.2 / G8.4: custom is the only provider whose stub baseURL must be
// replaced from config/env before any request.
test("only custom requires a base URL", () => {
  const custom = getProvider("custom");
  if (!custom) throw new Error("missing custom provider");
  expect(providerRequiresBaseURL(custom)).toBe(true);
  for (const id of ["deepseek", "mikan", "ollama", "vllm", "openai"]) {
    const provider = getProvider(id);
    if (!provider) throw new Error(`missing provider ${id}`);
    expect(providerRequiresBaseURL(provider)).toBe(false);
  }
});

test("missingBaseURLMessage is actionable", () => {
  const custom = getProvider("custom");
  if (!custom) throw new Error("missing custom provider");
  const msg = missingBaseURLMessage(custom);
  expect(msg).toContain("base_url");
  expect(msg).toContain("~/.openseek/config.toml");
  expect(msg).toContain("OPENSEEK_BASE_URL");
  expect(msg).toContain("CUSTOM_BASE_URL");
  expect(msg).toContain("openseek setup");
});
