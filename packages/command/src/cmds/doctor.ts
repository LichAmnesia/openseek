import type { Command, CommandResult } from "../types.ts";

const doctor: Command = {
  name: "doctor",
  description: "Run a set of environment / config sanity checks.",
  category: "diagnostics",
  isStub: false,
  async handle(ctx): Promise<CommandResult> {
    const checks: Array<{ name: string; ok: boolean; detail: string }> = [];
    checks.push({ name: "bun runtime", ok: typeof Bun !== "undefined", detail: typeof Bun !== "undefined" ? Bun.version : "missing" });
    checks.push({ name: "cwd", ok: Boolean(ctx.cwd), detail: ctx.cwd ?? "(unset)" });
    const fs = await import("node:fs");
    const cfgPresent = fs.existsSync(`${ctx.cwd ?? process.cwd()}/.openseek`);
    checks.push({ name: ".openseek dir", ok: cfgPresent, detail: cfgPresent ? "present" : "missing (run /init)" });
    const ok = checks.every((c) => c.ok);
    const text = checks.map((c) => `  [${c.ok ? "✓" : "✗"}] ${c.name}: ${c.detail}`).join("\n");
    return {
      kind: "text",
      payload: { text: `doctor: ${ok ? "OK" : "issues"}\n${text}`, data: { ok, checks } },
    };
  },
};

export default doctor;
