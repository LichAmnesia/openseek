// Google Vertex AI — Gemini SKUs (Anthropic-on-Vertex lives in vertex.ts).
// Same wire format as direct Gemini, but auth flows through GCP ADC instead
// of an API key.

import { createVertex } from "@ai-sdk/google-vertex";
import type { LanguageModel } from "ai";
import type { LLMProvider, ProviderCapability, ProviderOpts } from "../types.ts";

const DEFAULT_MODEL = "gemini-2.0-flash-exp";

const VERTEX_GEMINI_CAPABILITY: ProviderCapability = {
  contextWindow: 1_048_576,
  maxOutput: 8_192,
  supportsThinking: true,
  supportsCacheControl: false,
  supportsToolUse: true,
  payloadMode: "google-generate",
  requiresReasoningReplay: false,
};

export const vertexGoogleProvider: LLMProvider = {
  id: "vertex-google",
  protocol: "google",
  requiresApiKey: false,
  defaultModel: DEFAULT_MODEL,
  createClient(modelId, opts: ProviderOpts): LanguageModel {
    // The SDK loads project/location from env at construction time and throws
    // if either is missing. We stub safe defaults so unit tests + offline
    // boot work; production callers must set GOOGLE_VERTEX_PROJECT and
    // GOOGLE_VERTEX_LOCATION (or pass them via extraHeaders + a custom
    // baseURL) before making real requests.
    const project = process.env.GOOGLE_VERTEX_PROJECT ?? "openseek-placeholder";
    const location = process.env.GOOGLE_VERTEX_LOCATION ?? "us-central1";
    const sdk = createVertex({
      project,
      location,
      headers: opts.extraHeaders,
    });
    return sdk(modelId) as unknown as LanguageModel;
  },
  capability(_modelId: string): ProviderCapability {
    return VERTEX_GEMINI_CAPABILITY;
  },
};
