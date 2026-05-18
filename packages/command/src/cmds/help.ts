import type { Command, CommandCategory, CommandResult } from "../types.ts";

type HelpRow = { name: string; description: string; category?: CommandCategory };

const CATEGORY_ORDER: CommandCategory[] = [
  "session",
  "config",
  "auth",
  "tools",
  "git",
  "agent",
  "skills",
  "diagnostics",
  "ide",
  "advanced",
];

const CATEGORY_LABEL: Record<CommandCategory, string> = {
  session: "Session",
  config: "Config",
  auth: "Auth",
  tools: "Tools",
  git: "Git",
  agent: "Agents",
  skills: "Skills",
  diagnostics: "Diagnostics",
  ide: "IDE",
  advanced: "Advanced",
};

const help: Command = {
  name: "help",
  description: "List slash commands grouped by category. Pass a name for detail, a category to filter, or `all` for a flat list.",
  category: "diagnostics",
  isStub: false,
  async handle(ctx): Promise<CommandResult> {
    const target = ctx.args?.[0];
    const all = (ctx.state?.allCommands as HelpRow[] | undefined) ?? [];

    if (target !== undefined && target !== "all") {
      const hit = all.find((c) => c.name === target);
      if (hit) return { kind: "text", payload: { text: `/${hit.name} — ${hit.description}` } };
      if ((CATEGORY_ORDER as string[]).includes(target)) {
        const rows = all.filter((c) => c.category === target);
        if (rows.length === 0) {
          return { kind: "text", payload: { text: `no commands in category: ${target}` } };
        }
        return {
          kind: "text",
          payload: {
            text: formatSingleCategory(target as CommandCategory, rows),
            data: { count: rows.length },
          },
        };
      }
      return { kind: "text", payload: { text: `unknown command or category: ${target}` } };
    }

    if (all.length === 0) {
      return { kind: "text", payload: { text: "Type /<command>. No commands registered." } };
    }

    const text = target === "all" ? formatFlat(all) : formatGrouped(all);
    return { kind: "text", payload: { text, data: { count: all.length } } };
  },
};

function row(c: HelpRow): string {
  return `  ${`/${c.name}`.padEnd(20)} ${c.description}`;
}

function sortByName(rows: HelpRow[]): HelpRow[] {
  return rows.slice().sort((a, b) => a.name.localeCompare(b.name));
}

function formatSingleCategory(category: CommandCategory, rows: HelpRow[]): string {
  const lines = sortByName(rows).map(row);
  const noun = rows.length === 1 ? "command" : "commands";
  return `${CATEGORY_LABEL[category]}\n${lines.join("\n")}\n\n(${rows.length} ${noun} in /${category})`;
}

function formatFlat(rows: HelpRow[]): string {
  const lines = sortByName(rows).map(row);
  return `${lines.join("\n")}\n\n(${rows.length} commands total — /help <name> for details)`;
}

function formatGrouped(rows: HelpRow[]): string {
  const byCategory = new Map<string, HelpRow[]>();
  for (const r of rows) {
    const key = r.category ?? "advanced";
    const bucket = byCategory.get(key) ?? [];
    bucket.push(r);
    byCategory.set(key, bucket);
  }
  const sections: string[] = [];
  for (const cat of CATEGORY_ORDER) {
    const bucket = byCategory.get(cat);
    if (!bucket || bucket.length === 0) continue;
    sections.push(formatSection(cat, bucket));
  }
  for (const [cat, bucket] of byCategory) {
    if (!(CATEGORY_ORDER as string[]).includes(cat)) {
      sections.push(formatSection(cat as CommandCategory, bucket));
    }
  }
  return `${sections.join("\n\n")}\n\n(${rows.length} commands total — /help <name> for details, /help <category> to filter, /help all for a flat list)`;
}

function formatSection(category: CommandCategory, rows: HelpRow[]): string {
  const label = CATEGORY_LABEL[category] ?? category;
  const lines = sortByName(rows).map(row);
  return `${label}\n${lines.join("\n")}`;
}

export default help;
