// Pure-function double-Ctrl+C detector.
//
// First Ctrl+C → "cancel" (interrupt current stream).
// Second Ctrl+C within `timeoutMs` → "exit" (tear down renderer).
// After timeout, the next press is treated as the first again.
//
// Implementation is plain state-in-closure so tests can inject a clock
// (Date.now-style) and avoid timer flakiness.

export type CtrlCAction = "cancel" | "exit";

export interface CtrlCDetector {
  /** Record a Ctrl+C press at time `now` and return the action to take. */
  press: (now?: number) => CtrlCAction;
  /** Reset internal state — useful when a stream finishes naturally. */
  reset: () => void;
}

export interface DetectorOptions {
  /** Inter-press timeout in ms. Default 1500. */
  timeoutMs?: number;
  /** Clock injection — defaults to `Date.now`. */
  now?: () => number;
}

export function createDoubleCtrlCDetector(options: DetectorOptions = {}): CtrlCDetector {
  const timeoutMs = options.timeoutMs ?? 1500;
  const clock = options.now ?? (() => Date.now());
  let lastPress: number | null = null;

  return {
    press(now?: number): CtrlCAction {
      const t = now ?? clock();
      if (lastPress !== null && t - lastPress <= timeoutMs) {
        lastPress = null;
        return "exit";
      }
      lastPress = t;
      return "cancel";
    },
    reset() {
      lastPress = null;
    },
  };
}
