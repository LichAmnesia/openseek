import type { Command, CommandResult } from "../types.ts";

const STYLES = ["default", "concise", "verbose", "pirate", "sarcastic"] as const;
type Style = (typeof STYLES)[number];

const LABELS: Record<Style, string> = {
  default: "neutral engineering register",
  concise: "tight bullets, no fluff",
  verbose: "walk-through explanations",
  pirate: "yarrr, salty captain mode",
  sarcastic: "deadpan dry sarcasm",
};

const outputStyle: Command = {
  name: "output-style",
  description: "Get or set the assistant output style preset.",
  category: "config",
  isStub: false,
  async handle(ctx): Promise<CommandResult> {
    const next = ctx.args?.[0];
    if (!next) {
      const current = ctx.session?.outputStyle ?? "default";
      const list = STYLES.map((s) => `  ${s.padEnd(10)} ${LABELS[s]}`).join("\n");
      return {
        kind: "text",
        payload: {
          text: `current: ${current}\nstyles:\n${list}`,
          data: { current, styles: STYLES },
        },
      };
    }
    if (!isStyle(next)) {
      return {
        kind: "text",
        payload: {
          text: `error: unknown style '${next}'. styles: ${STYLES.join(", ")}`,
          data: { error: "unknown-style", styles: STYLES },
        },
      };
    }
    if (ctx.session) ctx.session.outputStyle = next;
    return {
      kind: "action",
      payload: {
        action: "set-output-style",
        text: `output-style → ${next} (${LABELS[next]})`,
        data: { style: next },
      },
    };
  },
};

function isStyle(v: string): v is Style {
  return (STYLES as readonly string[]).includes(v);
}

export default outputStyle;
