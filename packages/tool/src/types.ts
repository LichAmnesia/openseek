import type { ZodTypeAny, infer as zInfer } from "zod";

export type ToolMode = "plan" | "agent" | "yolo";

/**
 * Permission tag controlling whether a tool is available in a given ToolMode.
 *  - "auto"          → always available, no prompt (reads, search, etc.)
 *  - "ask"           → available, but caller layer should prompt before invoking
 *  - "deny-in-plan"  → filtered out under Plan mode (typically file writers / exec)
 */
export type ToolPermission = "auto" | "ask" | "deny-in-plan";

export interface ToolLogger {
  debug: (msg: string, meta?: unknown) => void;
  info: (msg: string, meta?: unknown) => void;
  warn: (msg: string, meta?: unknown) => void;
  error: (msg: string, meta?: unknown) => void;
}

export interface ToolContext {
  abort: AbortSignal;
  cwd: string;
  mode: ToolMode;
  log: ToolLogger;
}

export type ToolResult =
  | { kind: "text"; text: string }
  | { kind: "diff"; before: string; after: string; path: string }
  | { kind: "error"; message: string };

export interface Tool<Schema extends ZodTypeAny, _Out = ToolResult> {
  name: string;
  description: string;
  inputSchema: Schema;
  permission: ToolPermission;
  call: (input: zInfer<Schema>, ctx: ToolContext) => Promise<ToolResult>;
}

export type AnyTool = Tool<ZodTypeAny>;

export const noopLogger: ToolLogger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
};
