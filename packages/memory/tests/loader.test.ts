import { describe, expect, test } from "bun:test";
import {
  DEFAULT_MEMORY_TEMPLATE,
  defaultMemory,
  loadMemory,
  memoryFilePath,
  mergeMemory,
  renderMemory,
  saveMemory,
  type MemoryIO,
} from "../src/index.ts";

function inMemoryIO(initial: Record<string, string> = {}): MemoryIO & {
  store: Map<string, string>;
} {
  const store = new Map<string, string>(Object.entries(initial));
  return {
    store,
    read: async (p) => (store.has(p) ? (store.get(p) ?? null) : null),
    write: async (p, c) => {
      store.set(p, c);
    },
    exists: async (p) => store.has(p),
  };
}

describe("loader", () => {
  test("loadMemory returns DEFAULT template when file is absent", async () => {
    const io = inMemoryIO();
    const m = await loadMemory("workspace", "/ws/x", io);
    expect(m.sections.title.instruction).toBe(
      DEFAULT_MEMORY_TEMPLATE.sections.title.instruction,
    );
    expect(m.sections.worklog.content).toBe("");
  });

  test("loadMemory parses an existing memory.md", async () => {
    const filled = defaultMemory();
    filled.sections.title.content = "stored run";
    filled.sections.results.content = "- 256 tests pass";
    const path = memoryFilePath("workspace", "/ws/x");
    const io = inMemoryIO({ [path]: renderMemory(filled) });
    const m = await loadMemory("workspace", "/ws/x", io);
    expect(m.sections.title.content).toBe("stored run");
    expect(m.sections.results.content).toBe("- 256 tests pass");
  });

  test("saveMemory writes rendered markdown through the IO override", async () => {
    const io = inMemoryIO();
    const m = defaultMemory();
    m.sections.title.content = "save round-trip";
    await saveMemory(m, "workspace", "/ws/x", io);
    const path = memoryFilePath("workspace", "/ws/x");
    const stored = io.store.get(path);
    expect(stored).toBeDefined();
    expect(stored ?? "").toContain("# Session Title");
    expect(stored ?? "").toContain("save round-trip");
  });

  test("mergeMemory layers a partial delta over a base memory", () => {
    const base = defaultMemory();
    base.sections.title.content = "base title";
    const merged = mergeMemory(base, {
      sections: {
        ...base.sections,
        learnings: { instruction: base.sections.learnings.instruction, content: "- A" },
        errors: { instruction: base.sections.errors.instruction, content: "- E" },
      },
    });
    expect(merged.sections.title.content).toBe("base title");
    expect(merged.sections.learnings.content).toBe("- A");
    expect(merged.sections.errors.content).toBe("- E");
  });
});
