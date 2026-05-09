import { describe, expect, test } from "bun:test";
import {
  DEFAULT_MEMORY_TEMPLATE,
  MEMORY_SECTION_ORDER,
  defaultMemory,
  parseMemory,
  renderMemory,
} from "../src/index.ts";

describe("template", () => {
  test("renders all 10 sections as H1 headings in canonical order", () => {
    const md = renderMemory(DEFAULT_MEMORY_TEMPLATE);
    const headings = md.match(/^# .+$/gm) ?? [];
    expect(headings).toHaveLength(10);
    expect(headings[0]).toBe("# Session Title");
    expect(headings[9]).toBe("# Worklog");
  });

  test("each default section has an italic instruction line under the H1", () => {
    const md = renderMemory(DEFAULT_MEMORY_TEMPLATE);
    for (const id of MEMORY_SECTION_ORDER) {
      const section = DEFAULT_MEMORY_TEMPLATE.sections[id];
      expect(section.instruction.length).toBeGreaterThan(0);
      expect(md).toContain(`_${section.instruction}_`);
    }
  });

  test("round-trip: parseMemory(renderMemory(m)) reproduces the same memory", () => {
    const m = defaultMemory();
    m.sections.title.content = "OpenSeek G2.3 build";
    m.sections.errors.content = "- failed bun run, missing dep";
    const md = renderMemory(m);
    const parsed = parseMemory(md);
    expect(parsed).not.toBeNull();
    expect(parsed?.sections.title.content).toBe("OpenSeek G2.3 build");
    expect(parsed?.sections.title.instruction).toBe(m.sections.title.instruction);
    expect(parsed?.sections.errors.content).toBe("- failed bun run, missing dep");
    expect(parsed?.sections.worklog.content).toBe("");
  });

  test("missing sections fall back to default template", () => {
    const partial = "# Session Title\n\n_custom instruction_\n\nhello\n";
    const parsed = parseMemory(partial);
    expect(parsed).not.toBeNull();
    expect(parsed?.sections.title.content).toBe("hello");
    expect(parsed?.sections.title.instruction).toBe("custom instruction");
    expect(parsed?.sections.worklog.instruction).toBe(
      DEFAULT_MEMORY_TEMPLATE.sections.worklog.instruction,
    );
    expect(parsed?.sections.worklog.content).toBe("");
  });

  test("non-markdown / no recognizable sections returns null", () => {
    expect(parseMemory("")).toBeNull();
    expect(parseMemory("just a paragraph with no headings")).toBeNull();
    expect(parseMemory("## h2 only\nno h1 sections here")).toBeNull();
  });
});
