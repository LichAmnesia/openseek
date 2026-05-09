import { z } from "zod";
import type { Tool, ToolResult } from "../types.ts";
import { resolveWithinCwd } from "../workspace.ts";

const inputSchema = z.object({
  patch: z
    .string()
    .min(1)
    .describe(
      "Unified diff text. Each file block must start with '--- a/<path>' / '+++ b/<path>' and contain one or more '@@' hunks.",
    ),
});

type ApplyPatchInput = z.infer<typeof inputSchema>;

interface Hunk {
  oldStart: number;
  lines: string[]; // each starts with ' ', '-', or '+'
}

interface FilePatch {
  path: string;
  hunks: Hunk[];
}

function parsePatch(raw: string): FilePatch[] {
  const lines = raw.split("\n");
  const files: FilePatch[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (line === undefined) {
      i += 1;
      continue;
    }
    if (line.startsWith("--- ")) {
      const next = lines[i + 1];
      if (!next || !next.startsWith("+++ ")) {
        throw new Error(`malformed patch: '---' at line ${i + 1} without '+++' follow-up`);
      }
      const newPath = next.slice(4).replace(/^b\//, "").trim();
      if (newPath.length === 0) {
        throw new Error(`malformed patch: empty target path at line ${i + 2}`);
      }
      i += 2;
      const hunks: Hunk[] = [];
      while (i < lines.length) {
        const hLine = lines[i];
        if (hLine === undefined) break;
        if (hLine.startsWith("--- ")) break; // next file
        if (!hLine.startsWith("@@")) {
          i += 1;
          continue;
        }
        const m = /^@@\s+-(\d+)(?:,(\d+))?\s+\+(\d+)(?:,(\d+))?\s+@@/.exec(hLine);
        if (!m) {
          throw new Error(`malformed hunk header at line ${i + 1}: ${hLine}`);
        }
        const oldStart = Number.parseInt(m[1] ?? "1", 10);
        i += 1;
        const body: string[] = [];
        while (i < lines.length) {
          const bl = lines[i];
          if (bl === undefined) break;
          if (bl.startsWith("@@") || bl.startsWith("--- ")) break;
          if (bl.startsWith(" ") || bl.startsWith("-") || bl.startsWith("+")) {
            body.push(bl);
            i += 1;
            continue;
          }
          // Blank line or junk — stop this hunk and let outer loop look for
          // the next hunk header / file header.
          break;
        }
        hunks.push({ oldStart, lines: body });
      }
      if (hunks.length === 0) {
        throw new Error(`patch for ${newPath} has no hunks`);
      }
      files.push({ path: newPath, hunks });
      continue;
    }
    i += 1;
  }
  if (files.length === 0) {
    throw new Error("no file headers ('--- a/...') found in patch");
  }
  return files;
}

function applyHunks(original: string, hunks: Hunk[]): string {
  const orig = original.split("\n");
  // Build new file by walking original and applying hunks at oldStart positions.
  const out: string[] = [];
  let cursor = 0; // 0-based index into orig
  for (const hunk of hunks) {
    const target = hunk.oldStart - 1; // convert to 0-based
    if (target < cursor) {
      throw new Error(`hunks out of order at line ${hunk.oldStart}`);
    }
    while (cursor < target && cursor < orig.length) {
      out.push(orig[cursor] ?? "");
      cursor += 1;
    }
    for (const hl of hunk.lines) {
      const tag = hl[0];
      const content = hl.slice(1);
      if (tag === " ") {
        const expected = orig[cursor];
        if (expected === undefined) {
          throw new Error(`context past EOF at original line ${cursor + 1}`);
        }
        if (expected !== content) {
          throw new Error(
            `context mismatch at line ${cursor + 1}: expected ${JSON.stringify(content)}, got ${JSON.stringify(expected)}`,
          );
        }
        out.push(expected);
        cursor += 1;
      } else if (tag === "-") {
        const expected = orig[cursor];
        if (expected === undefined) {
          throw new Error(`delete past EOF at original line ${cursor + 1}`);
        }
        if (expected !== content) {
          throw new Error(
            `delete mismatch at line ${cursor + 1}: expected ${JSON.stringify(content)}, got ${JSON.stringify(expected)}`,
          );
        }
        cursor += 1;
      } else if (tag === "+") {
        out.push(content);
      }
    }
  }
  while (cursor < orig.length) {
    out.push(orig[cursor] ?? "");
    cursor += 1;
  }
  return out.join("\n");
}

const applyPatch: Tool<typeof inputSchema> = {
  name: "apply_patch",
  description:
    "Apply a unified diff to one or more files inside the workspace. All files are written atomically; on any failure no file is modified.",
  inputSchema,
  permission: "deny-in-plan",
  async call(input: ApplyPatchInput, ctx): Promise<ToolResult> {
    let parsed: FilePatch[];
    try {
      parsed = parsePatch(input.patch);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { kind: "error", message: `patch parse error: ${msg}` };
    }

    const updates: Array<{ abs: string; rel: string; before: string; after: string }> = [];
    for (const fp of parsed) {
      let resolved: { abs: string; relToCwd: string };
      try {
        resolved = resolveWithinCwd(ctx.cwd, fp.path);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return { kind: "error", message: `path error for ${fp.path}: ${msg}` };
      }
      const file = Bun.file(resolved.abs);
      if (!(await file.exists())) {
        return { kind: "error", message: `file not found: ${resolved.relToCwd}` };
      }
      const before = await file.text();
      let after: string;
      try {
        after = applyHunks(before, fp.hunks);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return { kind: "error", message: `hunk failure in ${resolved.relToCwd}: ${msg}` };
      }
      updates.push({ abs: resolved.abs, rel: resolved.relToCwd, before, after });
    }

    // Write phase — only after every file parsed + matched cleanly.
    for (const u of updates) {
      await Bun.write(u.abs, u.after);
    }

    if (updates.length === 1) {
      const only = updates[0];
      if (!only) {
        return { kind: "error", message: "internal: empty updates list" };
      }
      return { kind: "diff", before: only.before, after: only.after, path: only.rel };
    }
    const summary = updates.map((u) => `patched ${u.rel}`).join("\n");
    return { kind: "text", text: summary };
  },
};

export default applyPatch;
