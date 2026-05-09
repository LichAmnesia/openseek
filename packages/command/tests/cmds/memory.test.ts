import { test, expect } from "bun:test";
import type { MemoryIO } from "@openseek/memory";
import memory from "../../src/cmds/memory.ts";
import type { CommandContext } from "../../src/types.ts";

function memoryIo(initial: Record<string, string> = {}): {
  io: MemoryIO;
  files: Map<string, string>;
} {
  const files = new Map<string, string>(Object.entries(initial));
  return {
    files,
    io: {
      read: async (path) => files.get(path) ?? null,
      write: async (path, content) => {
        files.set(path, content);
      },
      exists: async (path) => files.has(path),
    },
  };
}

function ctx(over: Partial<CommandContext> = {}): CommandContext {
  const cwd = over.cwd ?? "/tmp/seek-test";
  return {
    cwd,
    args: over.args ?? [],
    state: { ...(over.state ?? {}) },
    session: over.session,
  };
}

test("/memory show returns 'no memory' when sections are empty", async () => {
  const { io } = memoryIo();
  const r = await memory.handle(ctx({ args: ["show"], state: { memoryIo: io } }));
  expect(r.kind).toBe("text");
  expect(r.payload.text).toContain("no memory");
});

test("/memory edit appends content to a section and saves it back", async () => {
  const { io, files } = memoryIo();
  const r = await memory.handle(
    ctx({
      args: ["edit", "learnings", "vim", "core", "is", "pure"],
      state: { memoryIo: io },
    }),
  );
  expect(r.kind).toBe("action");
  expect(r.payload.action).toBe("memory-edit");
  const written = [...files.values()][0] ?? "";
  expect(written).toContain("vim core is pure");
  expect(written).toContain("# Learnings");
});

test("/memory edit appends twice into the same section without clobber", async () => {
  const { io, files } = memoryIo();
  await memory.handle(
    ctx({ args: ["edit", "worklog", "first"], state: { memoryIo: io } }),
  );
  await memory.handle(
    ctx({ args: ["edit", "worklog", "second"], state: { memoryIo: io } }),
  );
  const written = [...files.values()][0] ?? "";
  expect(written).toContain("first");
  expect(written).toContain("second");
});

test("/memory clear strips a section's content but keeps its instruction", async () => {
  const { io } = memoryIo();
  await memory.handle(
    ctx({ args: ["edit", "errors", "boom"], state: { memoryIo: io } }),
  );
  const after = await memory.handle(
    ctx({ args: ["clear", "errors"], state: { memoryIo: io } }),
  );
  expect(after.payload.action).toBe("memory-clear");
  const show = await memory.handle(
    ctx({ args: ["show"], state: { memoryIo: io } }),
  );
  expect(show.payload.text).toContain("no memory");
});

test("/memory path prints the resolved memory.md path", async () => {
  const r = await memory.handle(ctx({ args: ["path"] }));
  expect(r.kind).toBe("text");
  expect(r.payload.text).toContain("memory.md");
  expect(r.payload.text).toContain("/tmp/seek-test");
});

test("/memory rejects unknown subcommand", async () => {
  const r = await memory.handle(ctx({ args: ["frobnicate"] }));
  expect(r.kind).toBe("text");
  expect(r.payload.text).toContain("unknown subcmd");
});

test("/memory edit rejects unknown section id", async () => {
  const { io } = memoryIo();
  const r = await memory.handle(
    ctx({ args: ["edit", "not-a-section", "hello"], state: { memoryIo: io } }),
  );
  expect(r.payload.text).toContain("unknown section");
});

test("/memory falls back to default when memory.md is absent", async () => {
  const { io } = memoryIo();
  const r = await memory.handle(ctx({ state: { memoryIo: io } }));
  expect(r.kind).toBe("text");
  expect(r.payload.text).toContain("no memory");
});
