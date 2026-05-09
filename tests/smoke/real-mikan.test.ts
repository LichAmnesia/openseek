// Real-API smoke (skipped unless OPENSEEK_REAL_API_KEY is set).
//
// Drives 8 scenarios against the configured provider. Most scenarios run 5
// rounds; web_search runs 3 because it adds external IO. By default this uses
// mikan-cloud + deepseek-v4-flash. You can swap to any of the 27 providers via
// env without changing this file:
//
//   # mikan-cloud (default)
//   OPENSEEK_REAL_API_KEY=sk-mikan-... bun test tests/smoke/real-mikan.test.ts
//
//   # deepseek direct
//   OPENSEEK_REAL_PROVIDER=deepseek \
//   OPENSEEK_REAL_API_KEY=sk-deepseek-... \
//     bun test tests/smoke/real-mikan.test.ts
//
//   # openai
//   OPENSEEK_REAL_PROVIDER=openai \
//   OPENSEEK_REAL_MODEL=gpt-4o-mini \
//   OPENSEEK_REAL_API_KEY=sk-openai-... \
//     bun test tests/smoke/real-mikan.test.ts
//
//   # any custom OpenAI-compat endpoint
//   OPENSEEK_REAL_PROVIDER=custom \
//   OPENSEEK_REAL_BASE_URL=https://api.example.com/v1 \
//   OPENSEEK_REAL_MODEL=my-model \
//   OPENSEEK_REAL_API_KEY=... \
//     bun test tests/smoke/real-mikan.test.ts
//
// We log per-scenario p50/p95 latency at the end. Each round asserts:
//   1. the model produced text,
//   2. every required tool was actually called,
//   3. every required tool returned a non-error ToolResult.

import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, test } from "bun:test";
import type { McpRouter } from "@openseek/mcp";
import type { OpenSeekMessage } from "@openseek/provider";
import { defaultProvider, getProvider } from "@openseek/provider";
import { runSession } from "@openseek/session";
import {
  agentSpawn as agentSpawnTool,
  bash as bashTool,
  edit as editTool,
  listMcpResources as listMcpResourcesTool,
  read as readTool,
  setAgentSpawnDeps,
  setMcpRouter,
  skill as skillTool,
  webSearch as webSearchTool,
} from "@openseek/tool";

const KEY = process.env.OPENSEEK_REAL_API_KEY ?? "";
const PROVIDER_ID = process.env.OPENSEEK_REAL_PROVIDER ?? "mikan";
const MODEL = process.env.OPENSEEK_REAL_MODEL ?? "";
const BASE_URL = process.env.OPENSEEK_REAL_BASE_URL ?? undefined;
const RUN = KEY.length > 0;
const SMOKE_DIR = join(tmpdir(), "openseek-real-smoke");

const provider = getProvider(PROVIDER_ID) ?? defaultProvider();
const modelId = MODEL.length > 0 ? MODEL : provider.defaultModel;

interface ScenarioInput {
  name: string;
  prompt: string;
  tools: Map<string, unknown>;
  expectedTools?: string[];
  beforeRound?: () => void;
  /** Override default round count (5). Slow scenarios (web_search) run fewer. */
  rounds?: number;
  /** Override default per-test timeout (300s). Web-search bumps to 600s. */
  timeoutMs?: number;
}

function user(text: string): OpenSeekMessage {
  return { role: "user", content: [{ type: "text", text }] };
}

interface OnceResult {
  ms: number;
  outChars: number;
  toolCalls: string[];
  toolResults: string[];
  toolErrors: string[];
}

async function once(prompt: string, tools: Map<string, unknown>): Promise<OnceResult> {
  installSmokeDeps();
  const t0 = Date.now();
  let outChars = 0;
  const toolCalls: string[] = [];
  const toolResults: string[] = [];
  const toolErrors: string[] = [];
  for await (const ev of runSession(
    {
      messages: [user(prompt)],
      mode: "agent",
      reasoningEffort: "off",
      model: modelId,
      provider: provider.id,
    },
    {
      provider,
      model: modelId,
      // biome-ignore lint/suspicious/noExplicitAny: drive arbitrary tool maps from outside
      tools: tools as any,
      capability: provider.capability(modelId),
      signal: new AbortController().signal,
      apiKey: KEY,
      baseURL: BASE_URL,
      cwd: SMOKE_DIR,
    },
  )) {
    if (ev.type === "text-delta") outChars += ev.delta.length;
    if (ev.type === "tool-call") toolCalls.push(ev.call.name);
    if (ev.type === "tool-result") {
      toolResults.push(ev.result.name);
      if (ev.result.result.kind === "error") {
        const msg = ev.result.result.message;
        toolErrors.push(`${ev.result.name}: ${msg}`);
      }
    }
    if (ev.type === "error") {
      throw ev.err instanceof Error ? ev.err : new Error(String(ev.err));
    }
  }
  return { ms: Date.now() - t0, outChars, toolCalls, toolResults, toolErrors };
}

function pct(arr: number[], q: number): number {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.floor(q * sorted.length));
  return sorted[idx] ?? 0;
}

const SCENARIOS: ScenarioInput[] = [
  {
    name: "plain-text",
    prompt: "Say hi in 5 words exactly.",
    tools: new Map(),
  },
  {
    name: "read",
    prompt: "Use the read tool on openseek-smoke-read.txt and summarize.",
    tools: new Map([["read", readTool]]) as unknown as Map<string, unknown>,
    expectedTools: ["read"],
    beforeRound: seedReadFixture,
  },
  {
    name: "edit",
    prompt: "Use the edit tool to replace 'old' with 'new' in openseek-smoke-edit.txt.",
    tools: new Map([["edit", editTool]]) as unknown as Map<string, unknown>,
    expectedTools: ["edit"],
    beforeRound: seedEditFixture,
  },
  {
    name: "bash",
    prompt: "Run `echo smoke-bash` via the bash tool.",
    tools: new Map([["bash", bashTool]]) as unknown as Map<string, unknown>,
    expectedTools: ["bash"],
  },
  {
    name: "web-search",
    prompt: "Search the web for the latest Bun release version.",
    tools: new Map([["web_search", webSearchTool]]) as unknown as Map<string, unknown>,
    expectedTools: ["web_search"],
    // web_search hits DuckDuckGo HTML + LLM round-trip → ~20-30s per round.
    // Reduce rounds + bump timeout so smoke isn't gated on slow IO.
    rounds: 3,
    timeoutMs: 600_000,
  },
  {
    name: "mcp",
    prompt: "Use the list_mcp_resources tool and report one resource URI.",
    tools: new Map([["list_mcp_resources", listMcpResourcesTool]]) as unknown as Map<
      string,
      unknown
    >,
    expectedTools: ["list_mcp_resources"],
  },
  {
    name: "skill",
    prompt: 'Use the skill tool with name \'smoke\' and args {"purpose":"real-smoke"}.',
    tools: new Map([["skill", skillTool]]) as unknown as Map<string, unknown>,
    expectedTools: ["skill"],
  },
  {
    name: "sub-agent",
    prompt:
      "Use the agent_spawn tool to ask a sub-agent to compute 2+2. Keep the sub-agent prompt short.",
    tools: new Map([["agent_spawn", agentSpawnTool]]) as unknown as Map<string, unknown>,
    expectedTools: ["agent_spawn"],
  },
];

function seedReadFixture(): void {
  mkdirSync(SMOKE_DIR, { recursive: true });
  writeFileSync(join(SMOKE_DIR, "openseek-smoke-read.txt"), "smoke read fixture\n");
}

function seedEditFixture(): void {
  mkdirSync(SMOKE_DIR, { recursive: true });
  writeFileSync(join(SMOKE_DIR, "openseek-smoke-edit.txt"), "old text here\n");
}

function installSmokeDeps(): void {
  setMcpRouter(makeSmokeMcpRouter());
  setAgentSpawnDeps({
    provider,
    model: modelId,
    capability: provider.capability(modelId),
    tools: new Map(),
    apiKey: KEY,
    baseURL: BASE_URL,
    cwd: SMOKE_DIR,
  });
}

function makeSmokeMcpRouter(): McpRouter {
  const handle = {
    server: { name: "smoke", transport: "stdio" as const, command: "smoke" },
    async listResources() {
      return [
        {
          uri: "file:///smoke/resource.txt",
          name: "smoke-resource",
          mimeType: "text/plain",
        },
      ];
    },
    async readResource() {
      return { contents: [{ uri: "file:///smoke/resource.txt", text: "smoke" }] };
    },
    async listTools() {
      return [];
    },
    async callTool() {
      return { content: [{ type: "text" as const, text: "smoke" }] };
    },
    async authStatus() {
      return { status: "authenticated" as const };
    },
    async close() {},
  };
  return {
    async connect() {
      return new Map([["smoke", handle]]);
    },
    get(name: string) {
      return name === "smoke" ? handle : undefined;
    },
    list() {
      return [handle];
    },
    configs() {
      return [handle.server];
    },
    async close() {},
  };
}

afterAll(() => {
  setAgentSpawnDeps(undefined);
  setMcpRouter(undefined);
  rmSync(SMOKE_DIR, { recursive: true, force: true });
});

describe.skipIf(!RUN)(`real-API smoke [provider=${PROVIDER_ID} model=${modelId}]`, () => {
  test("seed fixture files for read/edit", () => {
    installSmokeDeps();
    seedReadFixture();
    seedEditFixture();
  });

  for (const s of SCENARIOS) {
    const rounds = s.rounds ?? 5;
    const timeoutMs = s.timeoutMs ?? 300_000;
    test(
      s.name,
      async () => {
        const samples: number[] = [];
        for (let i = 0; i < rounds; i += 1) {
          s.beforeRound?.();
          const r = await once(s.prompt, s.tools);
          expect(r.outChars).toBeGreaterThan(0);
          expect(r.toolErrors).toEqual([]);
          for (const tool of s.expectedTools ?? []) {
            expect(r.toolCalls).toContain(tool);
            expect(r.toolResults).toContain(tool);
          }
          samples.push(r.ms);
        }
        // biome-ignore lint/suspicious/noConsole: smoke run reporting
        console.log(
          `[smoke] ${PROVIDER_ID}/${modelId} ${s.name}: p50=${pct(samples, 0.5)}ms p95=${pct(samples, 0.95)}ms n=${samples.length}`,
        );
      },
      timeoutMs,
    );
  }
});

if (!RUN) {
  test("real-API smoke disabled (set OPENSEEK_REAL_API_KEY to enable)", () => {});
}
