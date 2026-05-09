import {
  loadMemory,
  memoryFilePath,
  MEMORY_SECTION_ORDER,
  memorySectionHeading,
  saveMemory,
  type Memory,
  type MemoryIO,
  type MemoryScope,
  type MemorySectionId,
} from "@openseek/memory";
import type { Command, CommandContext, CommandResult } from "../types.ts";

const SUBS = ["show", "edit", "clear", "path"] as const;

const memory: Command = {
  name: "memory",
  description: "Inspect or edit the active memory.md (show / edit / clear / path).",
  category: "advanced",
  isStub: false,
  async handle(ctx): Promise<CommandResult> {
    const args = ctx.args ?? [];
    const sub = args[0];
    const scope = readScope(ctx);
    const workspace = ctx.cwd;
    const io = readIo(ctx);

    if (!sub || sub === "show") return await showMemory(scope, workspace, io);
    if (sub === "path") return showPath(scope, workspace);
    if (sub === "edit") return await editMemory(args.slice(1), scope, workspace, io);
    if (sub === "clear") return await clearMemory(args[1], scope, workspace, io);

    return {
      kind: "text",
      payload: {
        text: `error: unknown subcmd '${sub}'. usage: /memory [show|edit <section> <text>|clear <section>|path]`,
        data: { error: "unknown-subcmd", subcmds: SUBS },
      },
    };
  },
};

async function showMemory(
  scope: MemoryScope,
  workspace: string | undefined,
  io: MemoryIO | undefined,
): Promise<CommandResult> {
  if (scope === "workspace" && !workspace) {
    return {
      kind: "text",
      payload: { text: "(no memory loaded — workspace cwd missing)", data: { empty: true } },
    };
  }
  const mem = await loadMemory(scope, workspace, io);
  const populated = MEMORY_SECTION_ORDER.filter(
    (id) => (mem.sections[id]?.content ?? "").trim().length > 0,
  );
  if (populated.length === 0) {
    return {
      kind: "text",
      payload: {
        text: "(no memory loaded — sections empty)",
        data: { empty: true, sections: [] },
      },
    };
  }
  const lines = populated.map((id) => {
    const section = mem.sections[id];
    const len = (section?.content ?? "").length;
    return `  ${id.padEnd(14)} ${memorySectionHeading(id)} · ${len} chars`;
  });
  return {
    kind: "text",
    payload: {
      text: lines.join("\n"),
      data: { sections: populated },
    },
  };
}

function showPath(scope: MemoryScope, workspace: string | undefined): CommandResult {
  if (scope === "workspace" && !workspace) {
    return {
      kind: "text",
      payload: {
        text: "error: workspace cwd missing — cannot resolve memory path",
        data: { error: "no-workspace" },
      },
    };
  }
  const path = memoryFilePath(scope, workspace);
  return {
    kind: "text",
    payload: { text: path, data: { path, scope } },
  };
}

async function editMemory(
  rest: string[],
  scope: MemoryScope,
  workspace: string | undefined,
  io: MemoryIO | undefined,
): Promise<CommandResult> {
  const sectionId = rest[0];
  const text = rest.slice(1).join(" ").trim();
  if (!sectionId || !text) {
    return {
      kind: "text",
      payload: {
        text: "usage: /memory edit <section> <text>",
        data: { error: "missing-args" },
      },
    };
  }
  if (!isSection(sectionId)) {
    return {
      kind: "text",
      payload: {
        text: `error: unknown section '${sectionId}'. valid: ${MEMORY_SECTION_ORDER.join(", ")}`,
        data: { error: "unknown-section" },
      },
    };
  }
  if (scope === "workspace" && !workspace) {
    return {
      kind: "text",
      payload: { text: "error: workspace cwd missing", data: { error: "no-workspace" } },
    };
  }
  const mem = await loadMemory(scope, workspace, io);
  const next = appendToSection(mem, sectionId, text);
  await saveMemory(next, scope, workspace, io);
  return {
    kind: "action",
    payload: {
      action: "memory-edit",
      text: `memory: appended ${text.length} chars → ${sectionId}`,
      data: { section: sectionId, appended: text.length },
    },
  };
}

async function clearMemory(
  sectionId: string | undefined,
  scope: MemoryScope,
  workspace: string | undefined,
  io: MemoryIO | undefined,
): Promise<CommandResult> {
  if (!sectionId) {
    return {
      kind: "text",
      payload: { text: "usage: /memory clear <section>", data: { error: "missing-args" } },
    };
  }
  if (!isSection(sectionId)) {
    return {
      kind: "text",
      payload: {
        text: `error: unknown section '${sectionId}'. valid: ${MEMORY_SECTION_ORDER.join(", ")}`,
        data: { error: "unknown-section" },
      },
    };
  }
  if (scope === "workspace" && !workspace) {
    return {
      kind: "text",
      payload: { text: "error: workspace cwd missing", data: { error: "no-workspace" } },
    };
  }
  const mem = await loadMemory(scope, workspace, io);
  const cur = mem.sections[sectionId];
  const next: Memory = {
    sections: {
      ...mem.sections,
      [sectionId]: { instruction: cur?.instruction ?? "", content: "" },
    },
  };
  await saveMemory(next, scope, workspace, io);
  return {
    kind: "action",
    payload: {
      action: "memory-clear",
      text: `memory: cleared ${sectionId}`,
      data: { section: sectionId },
    },
  };
}

function appendToSection(mem: Memory, id: MemorySectionId, text: string): Memory {
  const cur = mem.sections[id];
  const prior = (cur?.content ?? "").trim();
  const merged = prior.length > 0 ? `${prior}\n${text}` : text;
  return {
    sections: {
      ...mem.sections,
      [id]: { instruction: cur?.instruction ?? "", content: merged },
    },
  };
}

function isSection(value: string): value is MemorySectionId {
  return (MEMORY_SECTION_ORDER as readonly string[]).includes(value);
}

function readScope(ctx: CommandContext): MemoryScope {
  const fromState = ctx.state?.memoryScope;
  return fromState === "global" ? "global" : ctx.cwd ? "workspace" : "global";
}

function readIo(ctx: CommandContext): MemoryIO | undefined {
  const io = ctx.state?.memoryIo;
  if (!io || typeof io !== "object") return undefined;
  const candidate = io as Partial<MemoryIO>;
  if (
    typeof candidate.read === "function" &&
    typeof candidate.write === "function" &&
    typeof candidate.exists === "function"
  ) {
    return candidate as MemoryIO;
  }
  return undefined;
}

export default memory;
