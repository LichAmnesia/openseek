/** @jsxImportSource @opentui/solid */
// First-run onboarding wizard (Phase 2).
//
// Three steps: provider → apiKey → model → done. Drives the pure state
// machine in `wizard-logic.ts`. Only one of the three step branches is
// rendered at a time so we always have exactly one focused element.
//
// The component intentionally OWNS no persistence — it calls
// `props.onComplete(result)` and lets the caller decide where to write.

import { Show, createMemo, createSignal, type JSX } from "solid-js";
import { useKeyboard } from "@opentui/solid";
import { defaultTheme } from "../theme.ts";
import {
  advanceStep,
  initialWizardState,
  toResult,
  type WizardProviderInfo,
  type WizardResult,
  type WizardState,
  type WizardStep,
} from "./wizard-logic.ts";
import {
  ApiKeyStep,
  ModelStep,
  ProviderStep,
} from "./wizard-steps.tsx";

export type { WizardProviderInfo, WizardResult } from "./wizard-logic.ts";

export interface WizardProps {
  /** Initial values (from existing config — used as defaults). */
  initial?: {
    provider?: string;
    model?: string;
    apiKey?: string;
  };
  /** Available providers to pick from — caller passes the full registry. */
  providers: WizardProviderInfo[];
  /**
   * Where the wizard begins. Default "provider" (full first-run flow).
   * Phase 3: `/model` jumps to "model"; `/provider` keeps "provider" but
   * with seeded values so the user can re-pick without re-typing the key.
   */
  initialStep?: WizardStep;
  /** Called once the wizard finishes. Persistence is the caller's job. */
  onComplete: (result: WizardResult) => void;
  /** Called when user aborts (Ctrl+C / Esc). */
  onCancel?: () => void;
}

export function Wizard(props: WizardProps): JSX.Element {
  const seedProvider =
    props.initial?.provider &&
    props.providers.some((p) => p.id === props.initial?.provider)
      ? props.initial.provider
      : (props.providers[0]?.id ?? "");

  const [state, setState] = createSignal<WizardState>(
    initialWizardState({
      step: props.initialStep ?? "provider",
      provider: seedProvider,
      apiKey: props.initial?.apiKey ?? "",
      model: props.initial?.model ?? "",
    }),
  );

  // Esc / Ctrl+C aborts. Step navigation (arrows, Enter) is handled by the
  // focused <select> / <input> directly.
  useKeyboard((evt) => {
    if (evt.name === "escape" || (evt.ctrl && evt.name === "c")) {
      props.onCancel?.();
    }
  });

  const advance = () => {
    setState((s) => {
      const next = advanceStep(s, props.providers);
      if (next.step === "done" && s.step !== "done") {
        // Defer so the render commits before the caller tears the renderer down.
        queueMicrotask(() => props.onComplete(toResult(next)));
      }
      return next;
    });
  };

  return (
    <box flexDirection="column" padding={1} flexGrow={1}>
      <Header step={() => state().step} />
      <box flexDirection="column" paddingY={1} flexGrow={1}>
        <Show when={state().step === "provider"}>
          <ProviderStep
            providers={props.providers}
            value={() => state().provider}
            onChange={(id) => setState((s) => ({ ...s, provider: id }))}
            onSubmit={advance}
          />
        </Show>
        <Show when={state().step === "apiKey"}>
          <ApiKeyStep
            providerId={() => state().provider}
            value={() => state().apiKey}
            onChange={(v) => setState((s) => ({ ...s, apiKey: v }))}
            onSubmit={advance}
          />
        </Show>
        <Show when={state().step === "model"}>
          <ModelStep
            provider={() => providerById(props.providers, state().provider)}
            value={() => state().model}
            onChange={(v) => setState((s) => ({ ...s, model: v }))}
            onSubmit={advance}
          />
        </Show>
      </box>
      <text fg={defaultTheme.dim}>Esc / Ctrl+C to cancel</text>
    </box>
  );
}

function providerById(
  providers: WizardProviderInfo[],
  id: string,
): WizardProviderInfo | undefined {
  return providers.find((p) => p.id === id);
}

function Header(props: { step: () => string }): JSX.Element {
  const stepNum = createMemo(() => {
    switch (props.step()) {
      case "provider":
        return 1;
      case "apiKey":
        return 2;
      case "model":
        return 3;
      default:
        return 3;
    }
  });
  return (
    <box flexDirection="column">
      <text fg={defaultTheme.splash}>{`OpenSeek setup — step ${stepNum()}/3`}</text>
      <text fg={defaultTheme.dim}>
        Pick provider, paste API key, choose model. Settings save to ~/.openseek/config.toml.
      </text>
    </box>
  );
}
