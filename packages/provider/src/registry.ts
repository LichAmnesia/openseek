// Built-in provider registry for OpenSeek.
//
// v0.5 ships the full 25-provider matrix:
//  - 19 OpenAI-compat (mikan, openai, deepseek, deepseek-cn, fireworks,
//    nvidia-nim, novita, openrouter, sglang, vllm, groq, together, cerebras,
//    deepinfra, perplexity, mistral, xai, cohere, vercel-gateway)
//  -  4 Anthropic-protocol (anthropic, bedrock, vertex, azure-foundry)
//  -  2 Google Gemini      (google, vertex-google)
//  -  2 local/custom OpenAI-compat (ollama, custom)
//
// HIDDEN_PROVIDER_IDS: temporary hide list. Entries stay in the underlying
// `providerRegistry` map (so `getProvider("mikan")` still works for tests
// and any persisted user config that references the id), but are filtered
// out of `listProviders()` / `listProviderListings()` so the wizard doesn't
// surface them. `defaultProvider()` and `providerByModel()` also route past
// hidden ids. Empty the set to un-hide.
//
// Default provider is `deepseek` (direct api.deepseek.com) while `mikan`
// is hidden — same `deepseek-v4-flash` defaultModel, no wallet probe.

import { anthropicProvider } from "./providers/anthropic.ts";
import { azureFoundryProvider } from "./providers/azure-foundry.ts";
import { bedrockProvider } from "./providers/bedrock.ts";
import { cerebrasProvider } from "./providers/cerebras.ts";
import { cohereProvider } from "./providers/cohere.ts";
import { customProvider } from "./providers/custom.ts";
import { deepinfraProvider } from "./providers/deepinfra.ts";
import { deepseekCnProvider } from "./providers/deepseek-cn.ts";
import { deepseekProvider } from "./providers/deepseek.ts";
import { fireworksProvider } from "./providers/fireworks.ts";
import { googleProvider } from "./providers/google.ts";
import { groqProvider } from "./providers/groq.ts";
import { mikanProvider } from "./providers/mikan.ts";
import { mistralProvider } from "./providers/mistral.ts";
import { novitaProvider } from "./providers/novita.ts";
import { nvidiaNimProvider } from "./providers/nvidia-nim.ts";
import { ollamaProvider } from "./providers/ollama.ts";
import { openaiProvider } from "./providers/openai.ts";
import { openrouterProvider } from "./providers/openrouter.ts";
import { perplexityProvider } from "./providers/perplexity.ts";
import { sglangProvider } from "./providers/sglang.ts";
import { togetherProvider } from "./providers/together.ts";
import { vercelGatewayProvider } from "./providers/vercel-gateway.ts";
import { vertexGoogleProvider } from "./providers/vertex-google.ts";
import { vertexProvider } from "./providers/vertex.ts";
import { vllmProvider } from "./providers/vllm.ts";
import { xaiProvider } from "./providers/xai.ts";
import type { LLMProvider, ProviderModelInfo } from "./types.ts";

const ALL_PROVIDERS: LLMProvider[] = [
  // OpenAI-compat (with reasoning replay for DeepSeek-shaped weights)
  mikanProvider,
  openaiProvider,
  deepseekProvider,
  deepseekCnProvider,
  fireworksProvider,
  nvidiaNimProvider,
  novitaProvider,
  openrouterProvider,
  sglangProvider,
  vllmProvider,
  groqProvider,
  togetherProvider,
  cerebrasProvider,
  deepinfraProvider,
  perplexityProvider,
  mistralProvider,
  xaiProvider,
  cohereProvider,
  vercelGatewayProvider,
  // Anthropic protocol
  anthropicProvider,
  bedrockProvider,
  vertexProvider,
  azureFoundryProvider,
  // Google
  googleProvider,
  vertexGoogleProvider,
  // local / custom
  ollamaProvider,
  customProvider,
];

export const providerRegistry: Map<string, LLMProvider> = new Map(
  ALL_PROVIDERS.map((p) => [p.id, p]),
);

const HIDDEN_PROVIDER_IDS: ReadonlySet<string> = new Set(["mikan"]);

export function getProvider(id: string): LLMProvider | undefined {
  return providerRegistry.get(id);
}

export function defaultProvider(): LLMProvider {
  return deepseekProvider;
}

export function listProviders(): LLMProvider[] {
  return ALL_PROVIDERS.filter((p) => !HIDDEN_PROVIDER_IDS.has(p.id));
}

/**
 * Picker-friendly view of every registered provider. Used by the onboarding
 * wizard (Phase 2) so it doesn't need to reach into individual provider files.
 *
 * `label` is a humanised form of the id; `description` is a short tagline
 * derived from id + protocol so the picker has something to show without
 * round-tripping a big metadata file.
 */
export interface ProviderListing {
  id: string;
  label: string;
  description: string;
  defaultModel: string;
  availableModels?: ProviderModelInfo[];
}

const PROVIDER_LABELS: Record<string, { label: string; description: string }> = {
  mikan: { label: "mikan-cloud", description: "DeepSeek V4 via gateway · wallet + cache" },
  openai: { label: "OpenAI", description: "Direct api.openai.com" },
  deepseek: { label: "DeepSeek (intl)", description: "api.deepseek.com" },
  "deepseek-cn": { label: "DeepSeek (CN)", description: "api.deepseek.com (CN region)" },
  fireworks: { label: "Fireworks", description: "Open weights host" },
  "nvidia-nim": { label: "NVIDIA NIM", description: "build.nvidia.com" },
  novita: { label: "Novita", description: "Open-weights router" },
  openrouter: { label: "OpenRouter", description: "Aggregator (free-text models)" },
  sglang: { label: "SGLang (local)", description: "Local OpenAI-compat server" },
  vllm: { label: "vLLM (local)", description: "Local OpenAI-compat server" },
  groq: { label: "Groq", description: "Fast LPU inference" },
  together: { label: "Together AI", description: "Open-weights host" },
  cerebras: { label: "Cerebras", description: "Wafer-scale inference" },
  deepinfra: { label: "DeepInfra", description: "Open-weights host" },
  perplexity: { label: "Perplexity", description: "Search-augmented" },
  mistral: { label: "Mistral", description: "api.mistral.ai" },
  xai: { label: "xAI Grok", description: "api.x.ai" },
  cohere: { label: "Cohere", description: "Command R family" },
  "vercel-gateway": { label: "Vercel AI Gateway", description: "ai-gateway.vercel.sh" },
  anthropic: { label: "Anthropic", description: "Direct api.anthropic.com" },
  bedrock: { label: "AWS Bedrock", description: "Anthropic via Bedrock" },
  vertex: { label: "Vertex (Anthropic)", description: "GCP Vertex Anthropic" },
  "azure-foundry": { label: "Azure AI Foundry", description: "Anthropic via Azure" },
  google: { label: "Google Gemini", description: "generativelanguage.googleapis.com" },
  "vertex-google": { label: "Vertex (Gemini)", description: "GCP Vertex Gemini" },
  ollama: { label: "Ollama (local)", description: "127.0.0.1:11434 — no API key" },
  custom: { label: "Custom OpenAI-compat", description: "Set base_url + api_key" },
};

export function listProviderListings(): ProviderListing[] {
  return ALL_PROVIDERS.filter((p) => !HIDDEN_PROVIDER_IDS.has(p.id)).map((p) => {
    const meta = PROVIDER_LABELS[p.id] ?? { label: p.id, description: p.protocol };
    const out: ProviderListing = {
      id: p.id,
      label: meta.label,
      description: meta.description,
      defaultModel: p.defaultModel,
    };
    if (p.availableModels !== undefined) out.availableModels = p.availableModels;
    return out;
  });
}

/**
 * Best-effort routing of a model id back to its owning provider.
 *
 * The lookup is heuristic — we match against each provider's `defaultModel`
 * exact-equality first, then a few known prefixes (`gpt-*` → openai,
 * `claude-*` → anthropic, `gemini-*` → google, `deepseek-*` → deepseek).
 * Hidden providers are skipped so a hidden default-model owner can't shadow
 * a visible peer. Returns undefined when the model id is ambiguous so
 * callers can fall back to the explicit `<provider>/<model>` form.
 */
export function providerByModel(model: string): LLMProvider | undefined {
  if (!model) return undefined;

  // 1. exact default-model match (skip hidden providers — both mikan and
  //    deepseek default to `deepseek-v4-flash`; without the filter mikan
  //    would still win the loop and re-surface in routing).
  for (const p of ALL_PROVIDERS) {
    if (HIDDEN_PROVIDER_IDS.has(p.id)) continue;
    if (p.defaultModel === model) return p;
  }

  // 2. provider-id prefix in `<provider>/<model>` form.
  const slash = model.indexOf("/");
  if (slash > 0) {
    const head = model.slice(0, slash);
    const direct = providerRegistry.get(head);
    if (direct) return direct;
  }

  // 3. well-known model-family prefixes.
  if (model.startsWith("gpt-") || model.startsWith("o1") || model.startsWith("o3"))
    return openaiProvider;
  if (model.startsWith("claude-")) return anthropicProvider;
  if (model.startsWith("gemini-")) return googleProvider;
  if (model.startsWith("deepseek-")) return deepseekProvider;
  if (model.startsWith("llama-") || model.startsWith("llama3")) return groqProvider;
  if (model.startsWith("grok-")) return xaiProvider;
  if (model.startsWith("mistral-") || model.startsWith("ministral-"))
    return mistralProvider;
  if (model.startsWith("command-")) return cohereProvider;

  return undefined;
}
