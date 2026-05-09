// snip — wrapper around the snipCompact strategy from @openseek/session.
//
// The session-side strategy is the source of truth (see
// packages/session/src/compact/snip.ts). To avoid pulling the entire session
// runtime into @openseek/tool just for ten lines of array splicing, we mirror
// the same contract here. Behaviour MUST stay byte-for-byte identical with
// snipCompact: inclusive bounds, RangeError on bad input, fresh outer array.

import { z } from "zod";
import type { Tool, ToolResult } from "../types.ts";

const messageItem = z.object({
  role: z.string().min(1),
  content: z.unknown(),
});

const inputSchema = z.object({
  startIdx: z.number().int().min(0).describe("Inclusive start index of the slice to drop."),
  endIdx: z.number().int().min(0).describe("Inclusive end index. Must be ≥ startIdx."),
  messages: z
    .array(messageItem)
    .optional()
    .describe(
      "Optional pre-snapshot of the conversation. If omitted the tool reports the planned action without mutating anything (the run loop will apply the splice).",
    ),
});

type SnipInput = z.infer<typeof inputSchema>;
type Msg = z.infer<typeof messageItem>;

function snipMessages(messages: Msg[], startIdx: number, endIdx: number): Msg[] {
  if (
    !Number.isInteger(startIdx) ||
    !Number.isInteger(endIdx) ||
    startIdx < 0 ||
    endIdx < startIdx ||
    endIdx >= messages.length
  ) {
    throw new RangeError(
      `snip: invalid range [${startIdx}, ${endIdx}] for length ${messages.length}`,
    );
  }
  return [...messages.slice(0, startIdx), ...messages.slice(endIdx + 1)];
}

const snip: Tool<typeof inputSchema> = {
  name: "snip",
  description:
    "User-driven local message-range deletion. Mirrors the snipCompact strategy in @openseek/session/compact: inclusive [startIdx, endIdx], throws on bad bounds, returns a fresh array.",
  inputSchema,
  permission: "auto",
  async call(input: SnipInput, _ctx): Promise<ToolResult> {
    if (!input.messages) {
      const dropped = input.endIdx - input.startIdx + 1;
      return {
        kind: "text",
        text: `[snip plan: drop indices [${input.startIdx}, ${input.endIdx}] — ${dropped} message(s)]`,
      };
    }
    let out: Msg[];
    try {
      out = snipMessages(input.messages, input.startIdx, input.endIdx);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { kind: "error", message: msg };
    }
    const dropped = input.messages.length - out.length;
    return {
      kind: "text",
      text: `[snip applied: dropped ${dropped} message(s); kept ${out.length}]`,
    };
  },
};

export default snip;
