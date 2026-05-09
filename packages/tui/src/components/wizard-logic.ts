// Pure state-machine logic for the onboarding wizard (Phase 2).
//
// Split out of Wizard.tsx so the test suite can drive the state transitions
// without mounting OpenTUI. Each transition returns a fresh state object —
// the TUI layer adapts these to a Solid signal.

import type { ProviderModelInfo } from "@openseek/provider";

export type WizardStep = "provider" | "apiKey" | "model" | "done";

export interface WizardProviderInfo {
  id: string;
  /** Human label (e.g. "mikan-cloud" / "DeepSeek (direct)"). */
  label: string;
  /** Optional one-line description for the picker. */
  description?: string;
  /** Models the provider exposes; empty/undefined = free-text fallback. */
  availableModels?: ProviderModelInfo[];
  /** Default model id (used when no availableModels list or to preselect). */
  defaultModel: string;
}

export interface WizardState {
  step: WizardStep;
  provider: string;
  apiKey: string;
  model: string;
}

export interface WizardResult {
  provider: string;
  model: string;
  apiKey: string;
}

/** Local providers don't require an API key (they listen on localhost). */
const LOCAL_PROVIDERS = new Set(["ollama", "vllm", "sglang"]);

export function isApiKeyRequired(providerId: string): boolean {
  return !LOCAL_PROVIDERS.has(providerId);
}

export function initialWizardState(initial?: Partial<WizardState>): WizardState {
  return {
    step: initial?.step ?? "provider",
    provider: initial?.provider ?? "",
    apiKey: initial?.apiKey ?? "",
    model: initial?.model ?? "",
  };
}

/**
 * Compute the back-step for runtime-switch flows where the wizard was
 * launched at a specific step (e.g. `/model` jumps to "model"). Going
 * back past the initial step is a no-op so the user can't fall into a
 * partially-initialised provider/apiKey state.
 */
export function backStepBounded(state: WizardState, floor: WizardStep): WizardState {
  if (state.step === floor) return state;
  return backStep(state);
}

/**
 * Validate the current step's value and advance to the next step on success.
 * Returns the same state when validation fails — caller can re-prompt.
 */
export function advanceStep(
  state: WizardState,
  providers: WizardProviderInfo[],
): WizardState {
  switch (state.step) {
    case "provider": {
      const match = providers.find((p) => p.id === state.provider);
      if (!match) return state;
      // When advancing into apiKey, preselect the provider's default model
      // unless the caller already set one (initial preset via `initial`).
      const nextModel = state.model || match.defaultModel;
      return { ...state, step: "apiKey", model: nextModel };
    }
    case "apiKey": {
      if (isApiKeyRequired(state.provider) && state.apiKey.trim() === "") {
        return state;
      }
      return { ...state, step: "model" };
    }
    case "model": {
      if (state.model.trim() === "") return state;
      return { ...state, step: "done" };
    }
    case "done":
      return state;
  }
}

/** Move one step backwards. `provider` and `done` are absorbing-edge cases. */
export function backStep(state: WizardState): WizardState {
  switch (state.step) {
    case "provider":
      return state;
    case "apiKey":
      return { ...state, step: "provider" };
    case "model":
      return { ...state, step: "apiKey" };
    case "done":
      return { ...state, step: "model" };
  }
}

/** Convenience: snapshot the current state into a result. */
export function toResult(state: WizardState): WizardResult {
  return {
    provider: state.provider,
    model: state.model,
    apiKey: state.apiKey,
  };
}
