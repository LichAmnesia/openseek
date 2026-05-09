/** @jsxImportSource @opentui/solid */
// Mount helper for the onboarding wizard. Spins up an isolated CliRenderer,
// renders <Wizard>, and resolves a Promise once the user finishes or cancels.
// Kept separate from `mount.tsx` so the main TUI lifecycle doesn't entangle
// with the first-run flow.

import { createCliRenderer } from "@opentui/core";
import { render } from "@opentui/solid";
import { Wizard } from "./Wizard.tsx";
import type { WizardProviderInfo, WizardResult, WizardStep } from "./wizard-logic.ts";

export interface RunWizardOpts {
  providers: WizardProviderInfo[];
  initial?: { provider?: string; model?: string; apiKey?: string };
  /**
   * Which step to start at. Defaults to "provider" for the full first-run
   * flow. Phase 3 runtime-switch passes "model" or "provider" to skip
   * irrelevant steps when the user invokes `/model` or `/provider`.
   */
  initialStep?: WizardStep;
}

export async function runWizard(opts: RunWizardOpts): Promise<WizardResult | null> {
  const renderer = await createCliRenderer({
    exitOnCtrlC: false,
    targetFps: 30,
    useMouse: false,
  });

  return new Promise<WizardResult | null>((resolve) => {
    let settled = false;
    const finish = (result: WizardResult | null) => {
      if (settled) return;
      settled = true;
      // Tear down on the next tick so any pending renders flush first.
      queueMicrotask(() => {
        try {
          renderer.destroy();
        } catch {
          // best-effort
        }
        resolve(result);
      });
    };

    void render(
      () => (
        <Wizard
          providers={opts.providers}
          initial={opts.initial}
          initialStep={opts.initialStep}
          onComplete={(r) => finish(r)}
          onCancel={() => finish(null)}
        />
      ),
      renderer,
    );
  });
}
