/** @jsxImportSource @opentui/solid */
// Step-view components for the onboarding wizard. Split out of Wizard.tsx
// to keep that file under the 250-LOC budget. Each step is rendered
// inside an exclusive <Show> branch so only one element ever has focus.

import { Show, type JSX } from "solid-js";
import type { SelectOption } from "@opentui/core";
import { defaultTheme } from "../theme.ts";
import { isApiKeyRequired, type WizardProviderInfo } from "./wizard-logic.ts";

export interface ProviderStepProps {
  providers: WizardProviderInfo[];
  value: () => string;
  onChange: (id: string) => void;
  onSubmit: () => void;
}

export function ProviderStep(props: ProviderStepProps): JSX.Element {
  const options: SelectOption[] = props.providers.map((p) => ({
    name: p.label,
    description: p.description ?? "",
    value: p.id,
  }));
  const initialIndex = Math.max(
    0,
    props.providers.findIndex((p) => p.id === props.value()),
  );
  return (
    <box flexDirection="column" flexGrow={1}>
      <text fg={defaultTheme.system}>Provider</text>
      <select
        focused={true}
        options={options}
        selectedIndex={initialIndex}
        showDescription={true}
        wrapSelection={true}
        flexGrow={1}
        onChange={((_idx: number, opt: SelectOption | null) => {
          if (opt && typeof opt.value === "string") props.onChange(opt.value);
        }) as never}
        onSelect={((_idx: number, opt: SelectOption | null) => {
          if (opt && typeof opt.value === "string") {
            props.onChange(opt.value);
            props.onSubmit();
          }
        }) as never}
      />
    </box>
  );
}

export interface ApiKeyStepProps {
  providerId: () => string;
  value: () => string;
  onChange: (v: string) => void;
  onSubmit: () => void;
}

export function ApiKeyStep(props: ApiKeyStepProps): JSX.Element {
  const required = () => isApiKeyRequired(props.providerId());
  // Tradeoff (F1.1): we render the API key as plaintext rather than masked.
  //
  // The previous implementation fed `value="*****"` back into the controlled
  // <input>, which caused opentui to emit the masked string back as the next
  // onInput value — so onChange received "****" and ~/.openseek/config.toml
  // ended up storing literal asterisks instead of the real key.
  //
  // A correct mask would require either:
  //   (a) opentui exposing an uncontrolled / password-mode input, or
  //   (b) length-diffing logic that recovers the real chars from each emit.
  // Both add complexity for shoulder-surfer protection that is largely
  // theatre in a private terminal session. Plaintext for v1.0 — revisit if
  // we add a true password input upstream.

  return (
    <box flexDirection="column" flexGrow={1}>
      <text fg={defaultTheme.system}>
        {required() ? "API key (required)" : "API key (optional — local provider)"}
      </text>
      <box flexDirection="row">
        <text fg={defaultTheme.dim}>›&nbsp;</text>
        <input
          value={props.value()}
          focused={true}
          flexGrow={1}
          onInput={((v: string) => props.onChange(v)) as never}
          onSubmit={((_v: string) => props.onSubmit()) as never}
        />
      </box>
      <text fg={defaultTheme.dim}>press Enter to continue, Ctrl+C to cancel</text>
    </box>
  );
}

export interface ModelStepProps {
  provider: () => WizardProviderInfo | undefined;
  value: () => string;
  onChange: (v: string) => void;
  onSubmit: () => void;
}

export function ModelStep(props: ModelStepProps): JSX.Element {
  const list = () => props.provider()?.availableModels ?? [];
  const hasList = () => list().length > 0;
  return (
    <Show when={hasList()} fallback={<ModelFreeText {...props} />}>
      <ModelPicker {...props} />
    </Show>
  );
}

function ModelPicker(props: ModelStepProps): JSX.Element {
  const list = () => props.provider()?.availableModels ?? [];
  const options: () => SelectOption[] = () =>
    list().map((m) => ({
      name: m.label ?? m.id,
      description: m.description ?? "",
      value: m.id,
    }));
  const initialIndex = () => {
    const cur = props.value() || props.provider()?.defaultModel || "";
    const idx = list().findIndex((m) => m.id === cur);
    return idx < 0 ? 0 : idx;
  };
  return (
    <box flexDirection="column" flexGrow={1}>
      <text fg={defaultTheme.system}>Model</text>
      <select
        focused={true}
        options={options()}
        selectedIndex={initialIndex()}
        showDescription={true}
        wrapSelection={true}
        flexGrow={1}
        onChange={((_idx: number, opt: SelectOption | null) => {
          if (opt && typeof opt.value === "string") props.onChange(opt.value);
        }) as never}
        onSelect={((_idx: number, opt: SelectOption | null) => {
          if (opt && typeof opt.value === "string") {
            props.onChange(opt.value);
            props.onSubmit();
          }
        }) as never}
      />
    </box>
  );
}

function ModelFreeText(props: ModelStepProps): JSX.Element {
  const initial = props.value() || props.provider()?.defaultModel || "";
  if (initial && !props.value()) props.onChange(initial);
  return (
    <box flexDirection="column" flexGrow={1}>
      <text fg={defaultTheme.system}>Model id (free text — provider has no fixed list)</text>
      <box flexDirection="row">
        <text fg={defaultTheme.dim}>›&nbsp;</text>
        <input
          value={props.value() || initial}
          focused={true}
          flexGrow={1}
          onInput={((v: string) => props.onChange(v)) as never}
          onSubmit={((_v: string) => props.onSubmit()) as never}
        />
      </box>
    </box>
  );
}
