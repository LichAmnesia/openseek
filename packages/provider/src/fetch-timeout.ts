export const DEFAULT_FETCH_TIMEOUT_MS = 1500;

export function timeoutSignal(ms: number = DEFAULT_FETCH_TIMEOUT_MS): AbortSignal | undefined {
  if (!Number.isFinite(ms) || ms <= 0) return undefined;
  const withTimeout = AbortSignal as typeof AbortSignal & {
    timeout?: (milliseconds: number) => AbortSignal;
  };
  if (typeof withTimeout.timeout === "function") return withTimeout.timeout(ms);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  (timer as { unref?: () => void }).unref?.();
  return controller.signal;
}
