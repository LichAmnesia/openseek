// AWS Bedrock provider — Anthropic Messages over Bedrock runtime.
// Auth flows through AWS SigV4: the SDK consumes AWS_* env vars by default,
// but ProviderOpts.extraHeaders can carry AWS_ACCESS_KEY_ID / AWS_SECRET_KEY
// pre-baked. We do not block startup on missing creds — capability/createClient
// stays pure so unit tests run offline.

import { createAmazonBedrock } from "@ai-sdk/amazon-bedrock";
import type { LanguageModel } from "ai";
import type { LLMProvider, ProviderCapability, ProviderOpts } from "../types.ts";

const DEFAULT_MODEL = "anthropic.claude-sonnet-4-5-v1:0";

const BEDROCK_CAPABILITY: ProviderCapability = {
  contextWindow: 200_000,
  maxOutput: 8_192,
  supportsThinking: true,
  supportsCacheControl: true,
  supportsToolUse: true,
  payloadMode: "anthropic-messages",
  requiresReasoningReplay: false,
};

export const bedrockProvider: LLMProvider = {
  id: "bedrock",
  protocol: "anthropic",
  requiresApiKey: false,
  defaultModel: DEFAULT_MODEL,
  createClient(modelId, opts: ProviderOpts): LanguageModel {
    const sdk = createAmazonBedrock({
      // baseURL/region/creds are pulled from extraHeaders or env at call time.
      headers: opts.extraHeaders,
      // The Bedrock SDK accepts `baseUrl` in its settings to override the
      // service endpoint, but the field name varies — keep it minimal here.
    });
    return sdk(modelId) as unknown as LanguageModel;
  },
  capability(_modelId: string): ProviderCapability {
    return BEDROCK_CAPABILITY;
  },
};
