import { listProviders, providerByModel } from "@openseek/provider";
import type { Command, CommandContext, CommandResult } from "../types.ts";

/**
 * /model command — list or switch the active provider/model.
 *
 *  - `/model`               → list every registered provider with its default
 *                              model and a one-line capability summary, plus
 *                              the currently-selected model.
 *  - `/model <model>`       → switch to that model, routing the model id back
 *                              to its provider via providerByModel().
 *  - `/model <provider>/<model>` → switch to provider+model explicitly.
 *
 * The action result carries `{ provider, model }` so the cli interactive
 * layer can update its currentProvider/currentModel signals + status bar.
 */
const model: Command = {
  name: "model",
  description: "List models or switch the active model.",
  category: "config",
  isStub: false,
  async handle(ctx): Promise<CommandResult> {
    const arg = ctx.args?.[0];
    if (!arg) return listAll(ctx);
    return switchTo(ctx, arg);
  },
};

function listAll(ctx: CommandContext): CommandResult {
  const lines: string[] = [];
  const current =
    (typeof ctx.state?.currentProvider === "string"
      ? ctx.state.currentProvider
      : undefined) ?? "deepseek";
  const currentModel = ctx.session?.model ?? "unset";
  lines.push(`current: ${current}/${currentModel}`);
  lines.push("");
  lines.push("registered providers:");
  for (const p of listProviders()) {
    const cap = p.capability(p.defaultModel);
    const flags: string[] = [];
    if (cap.supportsThinking) flags.push("thinking");
    if (cap.supportsCacheControl) flags.push("cache-control");
    if (cap.requiresReasoningReplay) flags.push("replay");
    if (cap.supportsToolUse) flags.push("tools");
    const flagStr = flags.length > 0 ? ` [${flags.join(",")}]` : "";
    lines.push(`  ${p.id}/${p.defaultModel} (${p.protocol}, ctx ${cap.contextWindow})${flagStr}`);
  }
  return { kind: "text", payload: { text: lines.join("\n") } };
}

function switchTo(ctx: CommandContext, arg: string): CommandResult {
  const slash = arg.indexOf("/");
  let providerId: string | undefined;
  let modelId: string;

  if (slash > 0) {
    providerId = arg.slice(0, slash);
    modelId = arg.slice(slash + 1);
    // Validate the provider exists; if not, fall through to bare-model routing
    // (so e.g. "openai/gpt-4o" works even when user spells it differently).
    const known = listProviders().some((p) => p.id === providerId);
    if (!known) {
      providerId = undefined;
      modelId = arg;
    }
  } else {
    modelId = arg;
  }

  if (!providerId) {
    const routed = providerByModel(modelId);
    providerId = routed?.id;
  }

  if (!providerId) {
    return {
      kind: "text",
      payload: {
        text: `unknown model: ${arg}\nuse /model to list providers, or /model <provider>/<model>`,
      },
    };
  }

  if (ctx.session) ctx.session.model = modelId;
  if (ctx.state) ctx.state.currentProvider = providerId;

  return {
    kind: "action",
    payload: {
      action: "switch-model",
      text: `model → ${providerId}/${modelId}`,
      data: { provider: providerId, model: modelId },
    },
  };
}

export default model;
