import { stat } from "node:fs/promises";
import { z } from "zod";
import type { Tool, ToolResult } from "../types.ts";

const inputSchema = z.object({
  target: z
    .enum(["port", "file", "process"])
    .describe("What to probe: a TCP port, a filesystem path, or a process name (pgrep -f)."),
  value: z
    .string()
    .min(1)
    .describe("The concrete target value (e.g. '8080', './build.log', 'node server.js')."),
  intervalMs: z
    .number()
    .int()
    .min(100)
    .max(60_000)
    .optional()
    .describe("Polling cadence — accepted for forward-compatibility, single probe for now."),
  timeoutMs: z
    .number()
    .int()
    .min(50)
    .max(30_000)
    .optional()
    .describe("Per-probe timeout (default 1500ms)."),
});

type MonitorInput = z.infer<typeof inputSchema>;

const DEFAULT_TIMEOUT_MS = 1500;

const monitor: Tool<typeof inputSchema> = {
  name: "monitor",
  description:
    "Single-probe monitor for a TCP port / file / process (G3.7). Real-time streaming lands with the server in v0.6 — this tool returns one observation.",
  inputSchema,
  permission: "auto",
  async call(input: MonitorInput, ctx): Promise<ToolResult> {
    const timeoutMs = input.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    ctx.log.info("monitor probe", { target: input.target, value: input.value });
    if (input.target === "port") {
      return probePort(input.value, timeoutMs);
    }
    if (input.target === "file") {
      return probeFile(input.value);
    }
    return probeProcess(input.value, timeoutMs);
  },
};

async function probePort(raw: string, timeoutMs: number): Promise<ToolResult> {
  const port = Number.parseInt(raw, 10);
  if (!Number.isFinite(port) || port < 1 || port > 65535) {
    return { kind: "error", message: `invalid port: ${raw}` };
  }
  let socket: Awaited<ReturnType<typeof Bun.connect>> | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const connectPromise = Bun.connect({
      hostname: "127.0.0.1",
      port,
      socket: {
        data() {},
        open() {},
        close() {},
        error() {},
      },
    });
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error("timeout")), timeoutMs);
    });
    socket = (await Promise.race([connectPromise, timeout])) as Awaited<
      ReturnType<typeof Bun.connect>
    >;
    return { kind: "text", text: `port ${port} open` };
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    return { kind: "text", text: `port ${port} closed (${reason})` };
  } finally {
    if (timer) clearTimeout(timer);
    try {
      socket?.end();
    } catch {
      // ignore
    }
  }
}

async function probeFile(path: string): Promise<ToolResult> {
  try {
    const info = await stat(path);
    return {
      kind: "text",
      text: `file ${path} exists (size=${info.size} mtime=${info.mtime.toISOString()})`,
    };
  } catch {
    return { kind: "text", text: `file ${path} missing` };
  }
}

async function probeProcess(pattern: string, timeoutMs: number): Promise<ToolResult> {
  let proc: Bun.Subprocess<"ignore", "pipe", "pipe">;
  try {
    proc = Bun.spawn(["pgrep", "-f", pattern], {
      stdin: "ignore",
      stdout: "pipe",
      stderr: "pipe",
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { kind: "error", message: `failed to spawn pgrep: ${msg}` };
  }
  const timer = setTimeout(() => {
    try {
      proc.kill("SIGTERM");
    } catch {
      // ignore
    }
  }, timeoutMs);
  try {
    const [outText, code] = await Promise.all([new Response(proc.stdout).text(), proc.exited]);
    const pids = outText
      .split(/\s+/)
      .map((p) => p.trim())
      .filter((p) => p.length > 0 && /^\d+$/.test(p));
    if (code === 0 && pids.length > 0) {
      return { kind: "text", text: `process '${pattern}' running (pids=${pids.join(",")})` };
    }
    return { kind: "text", text: `process '${pattern}' not running` };
  } finally {
    clearTimeout(timer);
  }
}

export default monitor;
