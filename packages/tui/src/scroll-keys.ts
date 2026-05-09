// Scroll-key handling for the transcript ScrollBox.
//
// Why this file exists — the @opentui/core ScrollBoxRenderable has two known
// pitfalls when used with a streaming transcript (long messages appended
// during user-initiated PageUp scroll). Phase A diagnosis lives in
// `progress/scroll-bug-diagnosis.md`. Recap of the bugs we work around:
//
//   1. `_hasManualScroll` flag locks once the user scrolls up. It only clears
//      when scrollTop EXACTLY equals the *current* maxScrollTop. With content
//      streaming in, max grows faster than half-page PgDn closes the gap, so
//      sticky never re-engages — user has to mash PgDn ~37+ times.
//
//   2. `verticalScrollBar._scrollSize` (which `sb.scrollHeight` reads) lags
//      the actually-laid-out `content.height` for one tick after a Solid
//      commit. PgDn in that window clamps to the OLD max — perceived as a
//      no-op.
//
// Both are fixed at the App layer. We do NOT patch @opentui/core. Instead:
//
//   * `freshMaxScrollTop()` reads `content.height` (a BoxRenderable's measured
//     height) directly, bypassing the scrollbar's stale `_scrollSize`. This
//     dodges bug #2.
//
//   * `snapToBottom()` calls the (technically-private) `applyStickyStart
//     ("bottom")` to clear `_hasManualScroll` AND set `_stickyScrollBottom =
//     true` AND scroll to max. The method exists at runtime — see
//     node_modules/@opentui/core/index-d07rkqtc.js around line 9707. It's
//     just not in the public TS surface yet. We reach in via a typed adapter
//     (`ScrollBoxInternals`) so consumer code stays type-safe.
//
//   * The PgDn / Shift+Down handlers use a "near-bottom heuristic": if the
//     next position would land within one viewport of the *fresh* bottom, we
//     skip the incremental scroll and just snap. This single rule kills both
//     R2b ("PgDn lands at 44/488") and R4 ("51 presses to reach bottom").

import type { ScrollBoxRenderable } from "@opentui/core";

/**
 * Runtime view of ScrollBoxRenderable's private `applyStickyStart`. The
 * method is declared `private` in @opentui/core's d.ts, but it's called as
 * the official "re-engage sticky" path from the library's own
 * `recalculateBarProps`. We need it from the App layer to break out of the
 * `_hasManualScroll` lock without touching node_modules.
 *
 * `content.height` / `viewport.height` are already public on
 * `BoxRenderable`/`ContentRenderable`, so we don't need to widen those.
 */
type ApplyStickyStart = (start: "top" | "bottom" | "left" | "right") => void;
interface ScrollBoxInternals {
  applyStickyStart: ApplyStickyStart;
}

/** Reach the runtime-exposed `applyStickyStart` without an `any` cast. The
 * intermediate `unknown` step is required because TS rightly refuses a
 * direct cast — `applyStickyStart` is `private` in the source class. */
function asInternals(sb: ScrollBoxRenderable): ScrollBoxInternals {
  return sb as unknown as ScrollBoxInternals;
}

/**
 * Max scrollTop computed from the laid-out content height, NOT from the
 * scrollbar's `_scrollSize`. `content.height` is updated synchronously by
 * Yoga during Solid's commit; `_scrollSize` is only updated when
 * `recalculateBarProps` runs (scheduled, may lag by a tick).
 */
export function freshMaxScrollTop(sb: ScrollBoxRenderable): number {
  return Math.max(0, sb.content.height - sb.viewport.height);
}

/**
 * Re-engage sticky-bottom + jump to fresh max. Equivalent to CCB's
 * `scrollToBottom()` helper. Safe to call regardless of prior manual-scroll
 * state — `applyStickyStart` clears `_hasManualScroll` via its
 * `_isApplyingStickyScroll` guard + the subsequent `updateStickyState` pass.
 *
 * We also explicitly write `scrollTop = freshMax` AFTER applyStickyStart, in
 * case `verticalScrollBar.scrollSize` is stale (R5 race) — applyStickyStart
 * uses the bar's potentially-old `scrollHeight`, so we fixup with the value
 * computed from `content.height`.
 */
export function snapToBottom(sb: ScrollBoxRenderable): void {
  asInternals(sb).applyStickyStart("bottom");
  // Fixup for R5: applyStickyStart used `scrollHeight` which may still be
  // the pre-recalc value; content.height is already fresh. Setting scrollTop
  // when _isApplyingStickyScroll is back to false is fine — we WANT
  // _stickyScrollBottom to remain true (which the prior call established) and
  // _hasManualScroll to remain false. The scrollTop setter only sets
  // _hasManualScroll back to true if `!isAtStickyPosition()`; landing at
  // freshMax IS the sticky position once recalculateBarProps runs.
  const freshMax = freshMaxScrollTop(sb);
  if (sb.scrollTop < freshMax) {
    sb.scrollTop = freshMax;
  }
}

/**
 * Smart half-viewport PgDn with a "stuck-at-stale-clamp" fallback.
 *
 * Two failure modes the heuristic guards against:
 *
 * 1. **Near-bottom snap**: if the resulting position would land within one
 *    viewport of the fresh bottom, snap + re-engage sticky in one keystroke
 *    (avoids the user having to mash PgDn until scrollTop EXACTLY equals
 *    the current maxScrollTop for `_hasManualScroll` to reset).
 *
 * 2. **Stale-clamp escape**: `sb.scrollBy(0.5, "viewport")` clamps to
 *    `verticalScrollBar._scrollSize - viewportSize`. That field updates
 *    asynchronously (via `recalculateBarProps` → `process.nextTick`); during
 *    fast streaming it can lag the actually-laid-out `content.height`. If
 *    scrollBy did NOT advance the position (we hit the clamp), force a snap
 *    — the user pressed PgDn, expecting motion, and got nothing.
 */
export function pageDown(sb: ScrollBoxRenderable): void {
  const viewportH = sb.viewport.height;
  const freshMax = freshMaxScrollTop(sb);
  const before = sb.scrollTop;
  const next = before + viewportH / 2;
  if (next + viewportH >= freshMax) {
    snapToBottom(sb);
    return;
  }
  sb.scrollBy(0.5, "viewport");
  // Fallback: if scrollBy didn't actually move (stale clamp), the user is
  // effectively "at the visible bottom" of stale layout — snap to the fresh
  // bottom. Threshold = 1 row of progress so we don't false-positive when
  // halfViewport rounds down on tiny terminals.
  if (sb.scrollTop - before < 1) {
    snapToBottom(sb);
  }
}

/** Half-viewport PgUp. No bug here — going up clears nothing important. */
export function pageUp(sb: ScrollBoxRenderable): void {
  sb.scrollBy(-0.5, "viewport");
}

/** Shift+Down: one row, with the same near-bottom snap heuristic. */
export function lineDown(sb: ScrollBoxRenderable): void {
  const viewportH = sb.viewport.height;
  const next = sb.scrollTop + 1;
  if (next + viewportH >= freshMaxScrollTop(sb)) {
    snapToBottom(sb);
    return;
  }
  sb.scrollBy(1, "step");
}

/** Shift+Up: one row up. */
export function lineUp(sb: ScrollBoxRenderable): void {
  sb.scrollBy(-1, "step");
}

/** End: unconditional jump-to-bottom + re-engage sticky. */
export function jumpToBottom(sb: ScrollBoxRenderable): void {
  snapToBottom(sb);
}

/** Home: jump to top. (We don't applyStickyStart("top") because the
 * transcript's stickyStart is "bottom" — "top" wouldn't match and would just
 * reset position anyway. Direct write is clearer.) */
export function jumpToTop(sb: ScrollBoxRenderable): void {
  sb.scrollTop = 0;
}
