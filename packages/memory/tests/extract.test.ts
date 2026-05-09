import { describe, expect, test } from "bun:test";
import type { OpenSeekMessage } from "@openseek/provider";
import {
  extractMemories,
  loadMemory,
  memoryFilePath,
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

const sampleMessages: OpenSeekMessage[] = [
  { role: "user", content: [{ type: "text", text: "build the memory package" }] },
  { role: "assistant", content: [{ type: "text", text: "writing files" }] },
];

describe("extractMemories", () => {
  test("invokes the injected extractor with the messages", async () => {
    const io = inMemoryIO();
    const captured: { messages: OpenSeekMessage[] | null } = { messages: null };
    const extractor = async (msgs: OpenSeekMessage[]): Promise<Extracted> => {
      captured.messages = msgs;
      return { facts: [], errors: [], learnings: [] };
    };
    const delta = await extractMemories(sampleMessages, {
      extractor,
      scope: "workspace",
      workspace: "/ws/x",
      io,
    });
    expect(captured.messages).toBe(sampleMessages);
    expect(delta.applied).toBe(0);
    expect(delta.sections).toEqual([]);
  });

  test("path-like facts go to 'files', plain facts go to 'current-state'", async () => {
    const io = inMemoryIO();
    const extractor = async (): Promise<Extracted> => ({
      facts: ["packages/memory/src/loader.ts wired up", "spec G2.3 in flight"],
      errors: [],
      learnings: [],
    });
    const delta = await extractMemories(sampleMessages, {
      extractor,
      scope: "workspace",
      workspace: "/ws/x",
      io,
    });
    expect(delta.applied).toBe(2);
    expect(new Set(delta.sections)).toEqual(new Set(["files", "current-state"]));
    const memory = await loadMemory("workspace", "/ws/x", io);
    expect(memory.sections.files.content).toContain("packages/memory/src/loader.ts");
    expect(memory.sections["current-state"].content).toContain("spec G2.3 in flight");
  });

  test("errors are appended to the 'errors' section", async () => {
    const io = inMemoryIO();
    const extractor = async (): Promise<Extracted> => ({
      facts: [],
      errors: ["bun test failed: missing import path"],
      learnings: [],
    });
    const delta = await extractMemories(sampleMessages, {
      extractor,
      scope: "workspace",
      workspace: "/ws/x",
      io,
    });
    expect(delta.sections).toEqual(["errors"]);
    const memory = await loadMemory("workspace", "/ws/x", io);
    expect(memory.sections.errors.content).toContain("bun test failed");
  });

  test("learnings are appended to the 'learnings' section", async () => {
    const io = inMemoryIO();
    const extractor = async (): Promise<Extracted> => ({
      facts: [],
      errors: [],
      learnings: ["DI for IO keeps tests off-disk"],
    });
    const delta = await extractMemories(sampleMessages, {
      extractor,
      scope: "workspace",
      workspace: "/ws/x",
      io,
    });
    expect(delta.sections).toEqual(["learnings"]);
    const memory = await loadMemory("workspace", "/ws/x", io);
    expect(memory.sections.learnings.content).toContain("DI for IO keeps tests off-disk");
    expect(io.store.has(memoryFilePath("workspace", "/ws/x"))).toBe(true);
  });
});
