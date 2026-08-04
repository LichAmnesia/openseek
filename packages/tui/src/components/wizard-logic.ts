// Pure state-machine logic for the onboarding wizard (Phase 2).
//
// Split out of Wizard.tsx so the test suite can drive the state transitions
// without mounting OpenTUI. Each transition returns a fresh state object —
// the TUI layer adapts these to a Solid signal.

import type { ProviderModelInfo } from "@openseek/provider";

export type WizardStep = "provider" | "baseUrl" | "apiKey" | "model" | "done";

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
  /** Wizard must collect a base URL (provider default is a stub). */
  requiresBaseURL?: boolean;
}

export interface WizardState {
  step: WizardStep;
  provider: string;
  baseURL: string;
  apiKey: string;
  model: string;
}

export interface WizardResult {
  provider: string;
  model: string;
  apiKey: string;
  /** Only set when the provider declares requiresBaseURL. */
  baseURL?: string;
}

/**
 * Providers that don't require an API key. Local servers listen on
 * localhost; `custom` endpoints (llama-server / LM Studio / …) commonly
 * run unauthenticated — a key can still be entered, it's just optional.
 */
const LOCAL_PROVIDERS = new Set(["ollama", "vllm", "sglang", "custom"]);

export function isApiKeyRequired(providerId: string): boolean {
  return !LOCAL_PROVIDERS.has(providerId);
}

export function isBaseUrlRequired(
  providerId: string,
  providers: WizardProviderInfo[],
): boolean {
  return providers.find((p) => p.id === providerId)?.requiresBaseURL === true;
}

/** Minimal shape check for the baseUrl step — must be an http(s) URL. */
export function isValidBaseUrl(value: string): boolean {
  const v = value.trim();
  return v.startsWith("http://") || v.startsWith("https://");
}

export function initialWizardState(initial?: Partial<WizardState>): WizardState {
  return {
    step: initial?.step ?? "provider",
    provider: initial?.provider ?? "",
    baseURL: initial?.baseURL ?? "",
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
      // Preselect the provider's default model unless the caller already
      // set one (initial preset via `initial`).
      const nextModel = state.model || match.defaultModel;
      const nextStep: WizardStep = match.requiresBaseURL === true ? "baseUrl" : "apiKey";
      return { ...state, step: nextStep, model: nextModel };
    }
    case "baseUrl": {
      if (!isValidBaseUrl(state.baseURL)) return state;
      return { ...state, step: "apiKey" };
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
export function backStep(state: WizardState, providers: WizardProviderInfo[] = []): WizardState {
  switch (state.step) {
    case "provider":
      return state;
    case "baseUrl":
      return { ...state, step: "provider" };
    case "apiKey": {
      const prev: WizardStep = isBaseUrlRequired(state.provider, providers)
        ? "baseUrl"
        : "provider";
      return { ...state, step: prev };
    }
    case "model":
      return { ...state, step: "apiKey" };
    case "done":
      return { ...state, step: "model" };
  }
}

/** Convenience: snapshot the current state into a result. */
export function toResult(state: WizardState, providers: WizardProviderInfo[] = []): WizardResult {
  const out: WizardResult = {
    provider: state.provider,
    model: state.model,
    apiKey: state.apiKey,
  };
  if (isBaseUrlRequired(state.provider, providers) && state.baseURL.trim() !== "") {
    out.baseURL = state.baseURL.trim();
  }
  return out;
}
