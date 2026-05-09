import { describe, expect, test } from "bun:test";
import type { OpenSeekMessage } from "@openseek/provider";
import {
  defaultMemory,
  extractMemories,
  loadMemory,
  memoryFilePath,
  saveMemory,
  type Extracted,
  type MemoryIO,
} from "../src/index.ts";

function inMemoryIO(): MemoryIO & { store: Map<string, string> } {
  const store = new Map<string, string>();
  return {
    store,
    read: async (p) => (store.has(p) ? (store.get(p) ?? null) : null),
    write: async (p, c) => {
      store.set(p, c);
    },
    exists: async (p) => store.has(p),
  };
}

const messages: OpenSeekMessage[] = [
  { role: "user", content: [{ type: "text", text: "drive the integration" }] },
];

describe("integration", () => {
  test("create -> save -> load reproduces user content", async () => {
    const io = inMemoryIO();
    const m = defaultMemory();
    m.sections.title.content = "integration A";
    m.sections["task-spec"].content = "ship G2.3 + G2.4";
    await saveMemory(m, "workspace", "/ws/proj", io);
    const reloaded = await loadMemory("workspace", "/ws/proj", io);
    expect(reloaded.sections.title.content).toBe("integration A");
    expect(reloaded.sections["task-spec"].content).toBe("ship G2.3 + G2.4");
  });

  test("save -> extract -> load applies extracted deltas to the right sections", async () => {
    const io = inMemoryIO();
    const m = defaultMemory();
    m.sections.title.content = "integration B";
    await saveMemory(m, "workspace", "/ws/proj", io);

    const extractor = async (): Promise<Extracted> => ({
      facts: ["packages/memory/src/extract.ts implemented", "G2.4 gate green"],
      errors: ["intermediate biome warning fixed"],
      learnings: ["MemoryIO DI removes flaky disk tests"],
    });
    const delta = await extractMemories(messages, {
      extractor,
      scope: "workspace",
      workspace: "/ws/proj",
      io,
    });
    expect(delta.applied).toBe(4);

    const reloaded = await loadMemory("workspace", "/ws/proj", io);
    expect(reloaded.sections.title.content).toBe("integration B");
    expect(reloaded.sections.files.content).toContain("packages/memory/src/extract.ts");
    expect(reloaded.sections["current-state"].content).toContain("G2.4 gate green");
    expect(reloaded.sections.errors.content).toContain("biome warning fixed");
    expect(reloaded.sections.learnings.content).toContain("MemoryIO DI");
  });

  test("global vs workspace memory files live at independent paths", async () => {
    const io = inMemoryIO();
    const ws = defaultMemory();
    ws.sections.title.content = "ws-mem";
    const gl = defaultMemory();
    gl.sections.title.content = "global-mem";
    await saveMemory(ws, "workspace", "/ws/proj", io);
    await saveMemory(gl, "global", undefined, io);

    expect(io.store.has(memoryFilePath("workspace", "/ws/proj"))).toBe(true);
    expect(io.store.has(memoryFilePath("global"))).toBe(true);

    const wsBack = await loadMemory("workspace", "/ws/proj", io);
    const glBack = await loadMemory("global", undefined, io);
    expect(wsBack.sections.title.content).toBe("ws-mem");
    expect(glBack.sections.title.content).toBe("global-mem");
  });
});
