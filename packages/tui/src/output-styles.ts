// @openseek/tui — output-style presets (G4.5).
//
// LLM output "voice" presets, switchable at runtime. Each style ships with
// a short system-prompt fragment that can be prepended to the wire message
// list so the assistant adopts the requested register on the next turn.
//
// We keep this layer pure: `applyOutputStyle` returns a new array, never
// mutates the input. The cli wires this in at composer-submit time.

import type { OpenSeekMessage } from "@openseek/provider";

export type OutputStyle = "default" | "concise" | "verbose" | "pirate" | "sarcastic";

export interface OutputStyleSpec {
  id: OutputStyle;
  label: string;
  /** System-prompt fragment injected at the head of `messages`. */
  systemPrompt: string;
}

const STYLE_TAG_PREFIX = "[openseek:output-style]";

export const BUILTIN_OUTPUT_STYLES: OutputStyleSpec[] = [
  {
    id: "default",
    label: "default",
    systemPrompt: "Reply in your usual neutral, helpful engineering register — clear, accurate, no flourish.",
  },
  {
    id: "concise",
    label: "concise",
    systemPrompt: "Be terse. One short paragraph or a tight bullet list. Cut every word that is not load-bearing.",
  },
  {
    id: "verbose",
    label: "verbose",
    systemPrompt: "Take your time — explain context, motivation, and edge cases. Walk the reader through your reasoning step by step.",
  },
  {
    id: "pirate",
    label: "pirate",
    systemPrompt: "Yarrr! Speak like a pirate captain on the open seas — every reply peppered with 'aye', 'matey', and salty nautical metaphors.",
  },
  {
    id: "sarcastic",
    label: "sarcastic",
    systemPrompt: "Reply with dry, deadpan sarcasm. Stay technically correct, but treat every obvious thing as if it were the discovery of the century.",
  },
];

export const OUTPUT_STYLE_IDS: ReadonlyArray<OutputStyle> = BUILTIN_OUTPUT_STYLES.map(
  (s) => s.id,
);

export function getOutputStyleSpec(id: OutputStyle): OutputStyleSpec {
  const spec = BUILTIN_OUTPUT_STYLES.find((s) => s.id === id);
  if (!spec) throw new Error(`unknown output style: ${id}`);
  return spec;
}

export function isOutputStyle(value: string): value is OutputStyle {
  return (OUTPUT_STYLE_IDS as ReadonlyArray<string>).includes(value);
}

/**
 * Prepend the style's system prompt to `messages`. If the head already holds
 * an output-style system message we replace it in-place (so cycling styles
 * mid-session doesn't leave a stack of competing voices). For "default" we
 * strip any prior style header without injecting a new one.
 *
 * Pure: returns a new array, never mutates the input.
 */
export function applyOutputStyle(
  messages: OpenSeekMessage[],
  style: OutputStyle,
): OpenSeekMessage[] {
  if (!isOutputStyle(style)) {
    throw new Error(`unknown output style: ${style}`);
  }
  const stripped = stripStyleHeader(messages);
  if (style === "default") return stripped;
  const spec = getOutputStyleSpec(style);
  const header: OpenSeekMessage = {
    role: "system",
    content: [{ type: "text", text: `${STYLE_TAG_PREFIX} ${spec.systemPrompt}` }],
  };
  return [header, ...stripped];
}

function stripStyleHeader(messages: OpenSeekMessage[]): OpenSeekMessage[] {
  const head = messages[0];
  if (!head || head.role !== "system") return [...messages];
  const content = head.content;
  if (!Array.isArray(content) || content.length === 0) return [...messages];
  const first = content[0];
  if (
    first &&
    typeof first === "object" &&
    "type" in first &&
    first.type === "text" &&
    typeof first.text === "string" &&
    first.text.startsWith(STYLE_TAG_PREFIX)
  ) {
    return messages.slice(1);
  }
  return [...messages];
}
