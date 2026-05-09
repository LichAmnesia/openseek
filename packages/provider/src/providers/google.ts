// Google Gemini direct provider — Generative AI API.
// payloadMode "google-generate" signals to the protocol layer that messages
// should be encoded as Gemini contents/parts rather than chat-completion
// messages.

import { createGoogleGenerativeAI } from "@ai-sdk/google";
import type { LanguageModel } from "ai";
import type {
  LLMProvider,
  ProviderCapability,
  ProviderOpts,
} from "../types.ts";

const DEFAULT_BASE_URL = "https://generativelanguage.googleapis.com/v1beta";
const DEFAULT_MODEL = "gemini-2.0-flash-exp";

const GEMINI_CAPABILITY: ProviderCapability = {
  contextWindow: 1_048_576,
  maxOutput: 8_192,
  supportsThinking: true,
  supportsCacheControl: false,
  supportsToolUse: true,
  payloadMode: "google-generate",
  requiresReasoningReplay: false,
};

export const googleProvider: LLMProvider = {
  id: "google",
  protocol: "google",
  defaultModel: DEFAULT_MODEL,
  availableModels: [
    { id: "gemini-3-flash-preview", label: "Gemini 3 Flash", description: "Fast · 1M ctx" },
    { id: "gemini-3-pro-preview", label: "Gemini 3 Pro", description: "Frontier · 1M ctx" },
    { id: "gemini-2.0-flash-exp", label: "Gemini 2.0 Flash" },
  ],
  createClient(modelId, opts: ProviderOpts): LanguageModel {
    const sdk = createGoogleGenerativeAI({
      apiKey: opts.apiKey,
      baseURL: opts.baseURL ?? DEFAULT_BASE_URL,
      headers: opts.extraHeaders,
    });
    return sdk(modelId) as unknown as LanguageModel;
  },
  capability(_modelId: string): ProviderCapability {
    return GEMINI_CAPABILITY;
  },
};
