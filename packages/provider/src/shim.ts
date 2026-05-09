// Protocol shim — Anthropic Messages API ↔ OpenSeek internal message shape.
//
// OpenSeek normalizes everything through `OpenSeekMessage` (role + ContentBlock
// array). When we talk to an Anthropic-protocol provider we must emit the
// Anthropic block shape on the way out and parse it on the way back in.
//
// This shim lives in @openseek/provider so both the session runtime and the
// future v0.5 protocol-agnostic transport layer can call it without a circular
// dep on @openseek/session.
//
// We intentionally use a minimal local `AnthropicMessage` interface rather
// than importing from @ai-sdk/anthropic — the SDK shapes change between
// versions and we only need the structural fields the round-trip cares about.

import type { ContentBlock, MessageRole, OpenSeekMessage } from "./types.ts";

// ---------- minimal Anthropic message types ----------

export type AnthropicRole = "user" | "assistant";

export interface AnthropicTextBlock {
  type: "text";
  text: string;
  /** Anthropic prompt-cache breakpoint, passed through verbatim if present. */
  cache_control?: { type: "ephemeral" } | undefined;
}

export interface AnthropicThinkingBlock {
  type: "thinking";
  thinking: string;
  signature?: string;
}

export interface AnthropicToolUseBlock {
  type: "tool_use";
  id: string;
  name: string;
  input: unknown;
}

export interface AnthropicToolResultBlock {
  type: "tool_result";
  tool_use_id: string;
  content: string | AnthropicTextBlock[];
  is_error?: boolean;
}

export interface AnthropicImageBlock {
  type: "image";
  source: {
    type: "base64" | "url";
    media_type?: string;
    data?: string;
    url?: string;
  };
}

export type AnthropicContentBlock =
  | AnthropicTextBlock
  | AnthropicThinkingBlock
  | AnthropicToolUseBlock
  | AnthropicToolResultBlock
  | AnthropicImageBlock;

export interface AnthropicMessage {
  role: AnthropicRole;
  content: AnthropicContentBlock[];
}

// ---------- Anthropic → OpenSeek ----------

/**
 * Convert one Anthropic message into an OpenSeek message. Tool-result blocks
 * trigger a role flip from "user" to "tool" because the rest of OpenSeek
 * expects tool results on tool-typed messages.
 *
 * `cache_control` and Anthropic-specific signature fields are dropped from
 * the OpenSeek representation since the internal shape is provider-neutral;
 * `openSeekToAnthropic` re-emits them when called with a roundTrip carrier.
 */
export function anthropicToOpenSeek(msg: AnthropicMessage): OpenSeekMessage {
  // Tool-result blocks are routed onto a synthetic "tool" message so the
  // session runtime can pair them with their originating tool_call.
  const firstToolResult = msg.content.find(
    (b): b is AnthropicToolResultBlock => b.type === "tool_result",
  );

  if (msg.role === "user" && firstToolResult) {
    return {
      role: "tool",
      toolCallId: firstToolResult.tool_use_id,
      content: msg.content.map(blockAnthropicToOpenSeek),
    };
  }

  const role: MessageRole = msg.role;
  const out: OpenSeekMessage = {
    role,
    content: msg.content.map(blockAnthropicToOpenSeek),
  };

  // Pull thinking blocks into reasoningContent so downstream code can replay
  // them on providers that need it. The thinking block is also kept inline
  // — `replayReasoning` is idempotent for already-leading thinking blocks.
  const thinking = msg.content.find(
    (b): b is AnthropicThinkingBlock => b.type === "thinking",
  );
  if (thinking) {
    out.reasoningContent = thinking.thinking;
  }

  return out;
}

function blockAnthropicToOpenSeek(b: AnthropicContentBlock): ContentBlock {
  switch (b.type) {
    case "text":
      return { type: "text", text: b.text };
    case "thinking":
      return { type: "thinking", text: b.thinking };
    case "tool_use":
      return {
        type: "tool_call",
        toolCallId: b.id,
        toolName: b.name,
        args: b.input,
      };
    case "tool_result": {
      const result =
        typeof b.content === "string"
          ? b.content
          : b.content.map((c) => c.text).join("");
      const out: ContentBlock = {
        type: "tool_result",
        toolCallId: b.tool_use_id,
        result,
      };
      if (b.is_error !== undefined) out.isError = b.is_error;
      return out;
    }
    case "image":
      // We don't have a first-class image content block yet — represent it as
      // text with a marker so round-trip preserves the source URL/data.
      return {
        type: "text",
        text: imageBlockToMarker(b),
      };
  }
}

function imageBlockToMarker(b: AnthropicImageBlock): string {
  if (b.source.type === "url") return `[image:url:${b.source.url ?? ""}]`;
  return `[image:base64:${b.source.media_type ?? "image/png"}:${b.source.data ?? ""}]`;
}

// ---------- OpenSeek → Anthropic ----------

const IMAGE_URL_RE = /^\[image:url:(.*)\]$/;
const IMAGE_BASE64_RE = /^\[image:base64:([^:]+):(.*)\]$/;

/**
 * Convert an OpenSeek message into an Anthropic message. "tool" messages are
 * folded back onto the user role with a tool_result block, matching the
 * Anthropic Messages API.
 *
 * Throws on a "system" role — Anthropic's Messages API takes the system prompt
 * as a top-level field, not as a message — callers should pull system content
 * out before calling this function.
 */
export function openSeekToAnthropic(msg: OpenSeekMessage): AnthropicMessage {
  if (msg.role === "system") {
    throw new Error(
      "openSeekToAnthropic: system messages must be lifted to the top-level system field",
    );
  }

  const role: AnthropicRole = msg.role === "tool" ? "user" : msg.role;

  const content: AnthropicContentBlock[] = [];
  for (const block of msg.content) {
    const out = blockOpenSeekToAnthropic(block);
    if (out) content.push(out);
  }

  return { role, content };
}

function blockOpenSeekToAnthropic(b: ContentBlock): AnthropicContentBlock | null {
  switch (b.type) {
    case "text": {
      const url = b.text.match(IMAGE_URL_RE);
      if (url) {
        return { type: "image", source: { type: "url", url: url[1] } };
      }
      const base64 = b.text.match(IMAGE_BASE64_RE);
      if (base64) {
        return {
          type: "image",
          source: {
            type: "base64",
            media_type: base64[1],
            data: base64[2],
          },
        };
      }
      return { type: "text", text: b.text };
    }
    case "thinking":
      return { type: "thinking", thinking: b.text };
    case "tool_call":
      return {
        type: "tool_use",
        id: b.toolCallId,
        name: b.toolName,
        input: b.args,
      };
    case "tool_result": {
      const out: AnthropicToolResultBlock = {
        type: "tool_result",
        tool_use_id: b.toolCallId,
        content:
          typeof b.result === "string" ? b.result : JSON.stringify(b.result),
      };
      if (b.isError !== undefined) out.is_error = b.isError;
      return out;
    }
  }
}
