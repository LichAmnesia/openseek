// Token-count formatter for the status bar (G2.8).
//
// Compact, single-pass output suitable for ~12-char status segments:
//   0          → "0"
//   123        → "123"
//   1_234      → "1.2k"
//   12_345     → "12k"
//   1_500_000  → "1.5M"
//
// Negative inputs return "0"; non-finite numbers return "?".

const K = 1000;
const M = 1_000_000;
const B = 1_000_000_000;

export function formatTokens(n: number): string {
  if (!Number.isFinite(n)) return "?";
  if (n <= 0) return "0";
  if (n < K) return String(Math.round(n));
  if (n < 10 * K) return `${(n / K).toFixed(1)}k`;
  if (n < M) return `${Math.round(n / K)}k`;
  if (n < 10 * M) return `${(n / M).toFixed(1)}M`;
  if (n < B) return `${Math.round(n / M)}M`;
  return `${(n / B).toFixed(1)}B`;
}
