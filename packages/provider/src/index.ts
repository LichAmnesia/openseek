// @openseek/provider — LLM provider adapters (OpenAI-compat + Anthropic + Google).
// v0.5 ships the full 25+ provider matrix plus the protocol shim that bridges
// Anthropic Messages API content blocks to the internal `OpenSeekMessage`
// shape (and back).

export const PACKAGE_NAME = "@openseek/provider";

export type {
  ContentBlock,
  LLMProvider,
  MessageRole,
  OpenSeekMessage,
  PayloadMode,
  ProviderCapability,
  ProviderModelInfo,
  ProviderOpts,
  ProviderProtocol,
} from "./types.ts";

export {
  loadConfig,
  type ConfigSource,
  type ConfigSources,
  type ResolvedConfig,
} from "./config.ts";

export {
  saveUserConfig,
  type SaveUserConfigIO,
  type SaveUserConfigValues,
} from "./save-config.ts";

export { extractReasoning, replayReasoning } from "./transform.ts";

export {
  createOpenAICompatProvider,
  type OpenAICompatFactoryOpts,
} from "./openai-compat.ts";

// OpenAI-compat providers (19)
export { mikanProvider } from "./providers/mikan.ts";
export { openaiProvider } from "./providers/openai.ts";
export { deepseekProvider } from "./providers/deepseek.ts";
export { deepseekCnProvider } from "./providers/deepseek-cn.ts";
export { fireworksProvider } from "./providers/fireworks.ts";
export { nvidiaNimProvider } from "./providers/nvidia-nim.ts";
export { novitaProvider } from "./providers/novita.ts";
export { openrouterProvider } from "./providers/openrouter.ts";
export { sglangProvider } from "./providers/sglang.ts";
export { vllmProvider } from "./providers/vllm.ts";
export { groqProvider } from "./providers/groq.ts";
export { togetherProvider } from "./providers/together.ts";
export { cerebrasProvider } from "./providers/cerebras.ts";
export { deepinfraProvider } from "./providers/deepinfra.ts";
export { perplexityProvider } from "./providers/perplexity.ts";
export { mistralProvider } from "./providers/mistral.ts";
export { xaiProvider } from "./providers/xai.ts";
export { cohereProvider } from "./providers/cohere.ts";
export { vercelGatewayProvider } from "./providers/vercel-gateway.ts";

// Anthropic-protocol providers (4)
export { anthropicProvider } from "./providers/anthropic.ts";
export { bedrockProvider } from "./providers/bedrock.ts";
export { vertexProvider } from "./providers/vertex.ts";
export { azureFoundryProvider } from "./providers/azure-foundry.ts";

// Google Gemini (2)
export { googleProvider } from "./providers/google.ts";
export { vertexGoogleProvider } from "./providers/vertex-google.ts";

// local / custom (2)
export { ollamaProvider } from "./providers/ollama.ts";
export { customProvider } from "./providers/custom.ts";

export {
  defaultProvider,
  getProvider,
  listProviders,
  listProviderListings,
  providerByModel,
  providerRegistry,
  type ProviderListing,
} from "./registry.ts";

export {
  anthropicToOpenSeek,
  openSeekToAnthropic,
  type AnthropicMessage,
  type AnthropicContentBlock,
  type AnthropicTextBlock,
  type AnthropicThinkingBlock,
  type AnthropicToolUseBlock,
  type AnthropicToolResultBlock,
  type AnthropicImageBlock,
  type AnthropicRole,
} from "./shim.ts";

// v0.6 G6.2 / G6.3 — wallet
export {
  fetchWalletBalance,
  formatBalance,
  isLowBalance,
  lowBalanceMessage,
  type WalletClientOpts,
  type WalletInfo,
} from "./wallet.ts";

// v0.6 G6.4 — cost estimation
export {
  PRICING,
  estimateCost,
  formatCost,
  getPricing,
  type CostUsage,
  type ModelPricing,
} from "./pricing.ts";

// v0.6 G6.5 — settings sync
export {
  defaultCachePath,
  syncSettings,
  type SyncClientOpts,
  type SyncResult,
  type SyncSettings,
} from "./sync.ts";
