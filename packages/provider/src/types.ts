// Provider abstraction for OpenSeek (G1.7).
// Captures the protocol-level differences between providers (DeepSeek/Mikan
// reasoning replay vs OpenAI vs Anthropic vs Google) without binding to any
// concrete SDK shape — concrete SDKs are returned via `createClient`.

import type { LanguageModel } from "ai";

export type ProviderProtocol = "openai-compat" | "anthropic" | "google";

export type PayloadMode = "chat-completions" | "anthropic-messages" | "google-generate";

export interface ProviderCapability {
  /** Model context window in tokens. */
  contextWindow: number;
  /** Maximum output tokens for a single response. */
  maxOutput: number;
  /** Provider exposes a "thinking" / reasoning channel. */
  supportsThinking: boolean;
  /** Provider honors Anthropic-style cache_control breakpoints. */
  supportsCacheControl: boolean;
  /** Provider supports tool/function calling. */
  supportsToolUse: boolean;
  /** Wire format for outbound requests. */
  payloadMode: PayloadMode;
  /**
   * DeepSeek V4 quirk: when an assistant message contains tool_calls, every
   * subsequent request must replay that message's `reasoning_content` field
   * back to the API. OpenAI and Anthropic do NOT have this requirement.
   */
  requiresReasoningReplay: boolean;
  /**
   * Optional "fast / cheap variant" for THIS model. When `/fast` is ON,
   * the CLI swaps the per-turn outbound model id to this value while
   * keeping `nominal model` (status bar, transcript label) unchanged —
   * the toggle is per-turn, NOT a permanent provider switch. Leave
   * undefined when no faster sibling exists in the same provider.
   */
  fastVariant?: string;
}

export interface ProviderOpts {
  apiKey: string;
  baseURL?: string;
  extraHeaders?: Record<string, string>;
}

export interface ProviderModelInfo {
  id: string;
  /** Optional human label (e.g. "DeepSeek V4 Flash"). */
  label?: string;
  /** Optional one-line tagline (e.g. "1M ctx · $0.14/M in"). */
  description?: string;
}

export interface LLMProvider {
  /** Stable id used in config and registry lookups (e.g. "mikan", "openai"). */
  id: string;
  /** Wire-protocol family this provider belongs to. */
  protocol: ProviderProtocol;
  /**
   * Whether the CLI should block before making a request when no apiKey is
   * configured. Local/self-host providers can set this false.
   */
  requiresApiKey?: boolean;
  /** Default model id when the user does not specify one. */
  defaultModel: string;
  /** Build a ready-to-use ai-SDK `LanguageModel` client for `modelId`. */
  createClient: (modelId: string, opts: ProviderOpts) => LanguageModel;
  /** Look up capability for a specific model id. */
  capability: (modelId: string) => ProviderCapability;
  /**
   * Models this provider exposes for picker UIs. Empty/undefined means
   * caller can type any string (free-text aggregator like openrouter).
   */
  availableModels?: ProviderModelInfo[];
}

// ---------- internal message representation ----------

export type ContentBlock =
  | { type: "text"; text: string }
  | { type: "thinking"; text: string }
  | {
      type: "tool_call";
      toolCallId: string;
      toolName: string;
      args: unknown;
    }
  | {
      type: "tool_result";
      toolCallId: string;
      result: unknown;
      isError?: boolean;
    };

export type MessageRole = "system" | "user" | "assistant" | "tool";

export interface OpenSeekMessage {
  role: MessageRole;
  content: ContentBlock[];
  /**
   * Provider-emitted reasoning text, captured separately from `content` so we
   * can replay it on subsequent requests to providers that demand it
   * (DeepSeek V4 thinking + tool_calls).
   */
  reasoningContent?: string;
  /** Optional tool_call id linkage for tool-result messages. */
  toolCallId?: string;
}
