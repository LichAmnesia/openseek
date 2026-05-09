// Pure validation helpers for the Composer. Kept separate so we can test
// without rendering the actual <input> renderable.

export interface SubmitDecision {
  valid: boolean;
  reason?: string;
}

/**
 * Decide whether `text` is a submittable composer line.
 *
 * Rules (v0.1):
 *   - empty / whitespace-only → reject
 *   - otherwise valid
 */
export function validateSubmit(text: string): SubmitDecision {
  if (text.length === 0) return { valid: false, reason: "empty" };
  if (text.trim().length === 0) return { valid: false, reason: "whitespace" };
  return { valid: true };
}
