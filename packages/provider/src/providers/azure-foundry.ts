// Azure AI Foundry — runs OpenAI + Anthropic SKUs. We register it under the
// Anthropic protocol since the v0.5 use case is Claude on Azure; the wire
// format the SDK ultimately picks depends on the deployed model and is
// outside this layer's concern.

import { createAzure } from "@ai-sdk/azure";
import type { LanguageModel } from "ai";
import type {
  LLMProvider,
  ProviderCapability,
  ProviderOpts,
} from "../types.ts";

const DEFAULT_MODEL = "claude-sonnet-4-5";

const AZURE_FOUNDRY_CAPABILITY: ProviderCapability = {
  contextWindow: 200_000,
  maxOutput: 8_192,
  supportsThinking: true,
  supportsCacheControl: true,
  supportsToolUse: true,
  payloadMode: "anthropic-messages",
  requiresReasoningReplay: false,
};

export const azureFoundryProvider: LLMProvider = {
  id: "azure-foundry",
  protocol: "anthropic",
  defaultModel: DEFAULT_MODEL,
  createClient(modelId, opts: ProviderOpts): LanguageModel {
    const sdk = createAzure({
      apiKey: opts.apiKey,
      baseURL: opts.baseURL,
      headers: opts.extraHeaders,
    });
    return sdk(modelId) as unknown as LanguageModel;
  },
  capability(_modelId: string): ProviderCapability {
    return AZURE_FOUNDRY_CAPABILITY;
  },
};
