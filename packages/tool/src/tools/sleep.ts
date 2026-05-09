import { z } from "zod";
import type { Tool, ToolResult } from "../types.ts";

const MAX_SLEEP_MS = 600_000;

const inputSchema = z.object({
  ms: z
    .number()
    .int()
    .min(0)
    .max(MAX_SLEEP_MS)
    .describe(`Milliseconds to sleep (max ${MAX_SLEEP_MS}).`),
});

type SleepInput = z.infer<typeof inputSchema>;

const sleep: Tool<typeof inputSchema> = {
  name: "sleep",
  description:
    "Pause the agent for a fixed number of milliseconds. Cancellation aware: aborts immediately if the run is cancelled. Use for back-off between polls.",
  inputSchema,
  permission: "auto",
  async call(input: SleepInput, ctx): Promise<ToolResult> {
    if (input.ms === 0) {
      return { kind: "text", text: "[slept 0ms]" };
    }
    const start = Date.now();
    await new Promise<void>((resolve) => {
      const timer = setTimeout(() => {
        ctx.abort.removeEventListener("abort", onAbort);
        resolve();
      }, input.ms);
      const onAbort = () => {
        clearTimeout(timer);
        ctx.abort.removeEventListener("abort", onAbort);
        resolve();
      };
      ctx.abort.addEventListener("abort", onAbort, { once: true });
    });
    const elapsed = Date.now() - start;
    if (ctx.abort.aborted) {
      return { kind: "text", text: `[slept ${elapsed}ms (interrupted by abort)]` };
    }
    return { kind: "text", text: `[slept ${elapsed}ms]` };
  },
};

export default sleep;
