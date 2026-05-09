import { z } from "zod";
import type { Tool, ToolResult } from "../types.ts";

const inputSchema = z.object({
  question: z.string().min(1).describe("The question to ask the user."),
  options: z
    .array(z.string().min(1))
    .min(2)
    .max(8)
    .describe("Multiple-choice options (2 to 8 entries)."),
  allowFreeForm: z
    .boolean()
    .optional()
    .describe("If true, the user may type a free-form answer instead of picking an option."),
});

type AskUserQuestionInput = z.infer<typeof inputSchema>;

// ---------- DI slot ----------
//
// The CLI/TUI installs an `AskUserHandler` at startup. When unset (e.g. tests
// or non-interactive batch runs) the tool emits a structured "awaiting"
// payload so the caller layer can render the question itself.

export interface AskUserRequest {
  question: string;
  options: string[];
  allowFreeForm: boolean;
}

export type AskUserHandler = (req: AskUserRequest) => Promise<string>;

let injectedHandler: AskUserHandler | undefined;

export function setAskUserHandler(handler: AskUserHandler | undefined): void {
  injectedHandler = handler;
}

const askUserQuestion: Tool<typeof inputSchema> = {
  name: "ask_user_question",
  description:
    "Ask the user a multiple-choice question. Awaits a real answer when an interactive handler is installed (CLI/TUI); otherwise emits a structured `awaiting` payload.",
  inputSchema,
  permission: "auto",
  async call(input: AskUserQuestionInput, ctx): Promise<ToolResult> {
    const allowFreeForm = input.allowFreeForm ?? false;
    if (injectedHandler) {
      try {
        const answer = await injectedHandler({
          question: input.question,
          options: [...input.options],
          allowFreeForm,
        });
        return { kind: "text", text: answer };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return { kind: "error", message: `ask_user_question failed: ${msg}` };
      }
    }
    ctx.log.debug("ask_user_question awaiting (no handler installed)");
    const lines: string[] = [
      "[awaiting user response]",
      "",
      `Q: ${input.question}`,
      "Options:",
    ];
    input.options.forEach((opt, i) => {
      lines.push(`  ${i + 1}. ${opt}`);
    });
    if (allowFreeForm) {
      lines.push("  (free-form answer also accepted)");
    }
    return { kind: "text", text: lines.join("\n") };
  },
};

export default askUserQuestion;
