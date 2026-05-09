// Google Vertex AI — Anthropic Claude SKUs only (the Gemini Vertex provider
// is in vertex-google.ts). Uses @ai-sdk/google-vertex/anthropic which speaks
// the Anthropic Messages wire format under the hood.

import { createVertexAnthropic } from "@ai-sdk/google-vertex/anthropic";
import type { LanguageModel } from "ai";
import type { LLMProvider, ProviderCapability, ProviderOpts } from "../types.ts";

const DEFAULT_MODEL = "claude-sonnet-4-5@20250929";

const VERTEX_ANTHROPIC_CAPABILITY: ProviderCapability = {
  contextWindow: 200_000,
  maxOutput: 8_192,
  supportsThinking: true,
  supportsCacheControl: true,
  supportsToolUse: true,
  payloadMode: "anthropic-messages",
  requiresReasoningReplay: false,
};

export const vertexProvider: LLMProvider = {
  id: "vertex",
  protocol: "anthropic",
  requiresApiKey: false,
  defaultModel: DEFAULT_MODEL,
  createClient(modelId, opts: ProviderOpts): LanguageModel {
    // Stubbed defaults so SDK construction succeeds offline; production
    // callers set GOOGLE_VERTEX_PROJECT / GOOGLE_VERTEX_LOCATION via env.
    const project = process.env.GOOGLE_VERTEX_PROJECT ?? "openseek-placeholder";
    const location = process.env.GOOGLE_VERTEX_LOCATION ?? "us-central1";
    const sdk = createVertexAnthropic({
      project,
      location,
      headers: opts.extraHeaders,
    });
    return sdk(modelId) as unknown as LanguageModel;
  },
  capability(_modelId: string): ProviderCapability {
    return VERTEX_ANTHROPIC_CAPABILITY;
  },
};
