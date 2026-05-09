import { existsSync } from "node:fs";
import { z } from "zod";
import { resolveWithinCwd } from "../workspace.ts";
import type { Tool, ToolResult } from "../types.ts";

const inputSchema = z.object({
  path: z.string().min(1).describe("Workspace-relative path to surface to the user."),
  caption: z
    .string()
    .min(1)
    .optional()
    .describe("Optional caption / explanation shown alongside the file."),
});

type SendUserFileInput = z.infer<typeof inputSchema>;

// ---------- DI slot ----------
//
// The TUI installs a handler that pops the file in a preview pane. When unset
// (CLI / tests), the tool just emits a markdown link into the result so the
// orchestrator can render it.

export type SendUserFileHandler = (file: {
  abs: string;
  relToCwd: string;
  caption?: string;
}) => void | Promise<void>;

let injectedHandler: SendUserFileHandler | undefined;

export function setSendUserFileHandler(h: SendUserFileHandler | undefined): void {
  injectedHandler = h;
}

const sendUserFile: Tool<typeof inputSchema> = {
  name: "send_user_file",
  description:
    "Surface a workspace file to the user — emits a markdown link and, if the TUI installed a preview handler, triggers a file-preview signal.",
  inputSchema,
  permission: "ask",
  async call(input: SendUserFileInput, ctx): Promise<ToolResult> {
    let resolved: ReturnType<typeof resolveWithinCwd>;
    try {
      resolved = resolveWithinCwd(ctx.cwd, input.path);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { kind: "error", message: msg };
    }
    if (!existsSync(resolved.abs)) {
      return { kind: "error", message: `path does not exist: ${resolved.relToCwd}` };
    }

    if (injectedHandler) {
      try {
        await injectedHandler({
          abs: resolved.abs,
          relToCwd: resolved.relToCwd,
          caption: input.caption,
        });
      } catch (err) {
        ctx.log.warn("send_user_file handler failed", err);
      }
    }
    const captionPart = input.caption ? `\n\n${input.caption}` : "";
    return {
      kind: "text",
      text: `[file → user] [${resolved.relToCwd}](${resolved.relToCwd})${captionPart}`,
    };
  },
};

export default sendUserFile;
