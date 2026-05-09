import type { Command, CommandResult } from "../types.ts";

const files: Command = {
  name: "files",
  description: "List files in cwd matching an optional glob (default: '*').",
  category: "tools",
  isStub: false,
  async handle(ctx): Promise<CommandResult> {
    const pattern = ctx.args?.[0] ?? "*";
    const cwd = ctx.cwd ?? process.cwd();
    const matches: string[] = [];
    try {
      const glob = new Bun.Glob(pattern);
      for await (const m of glob.scan({ cwd, onlyFiles: true })) {
        matches.push(m);
        if (matches.length >= 50) break;
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { kind: "text", payload: { text: `glob failed: ${msg}` } };
    }
    return {
      kind: "text",
      payload: {
        text: matches.length === 0 ? `(no matches for '${pattern}')` : matches.join("\n"),
        data: { count: matches.length, matches },
      },
    };
  },
};

export default files;
