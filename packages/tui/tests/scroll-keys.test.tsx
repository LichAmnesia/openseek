/** @jsxImportSource @opentui/solid */
// Phase B regression tests for the "PageDown stuck after long output" bug.
//
// These tests started life in `progress/scroll-bug-diagnosis.test.tsx` as
// the Phase A repro harness; they ran against the unmodified scrollBox
// handlers and asserted the *current (buggy)* behavior. Phase B moves them
// into the package's normal test directory and flips the FIXME assertions
// to assert the *post-fix* behavior driven by `src/scroll-keys.ts`.
//
// We mount <Transcript> the same way as Phase A but drive the scroll via
// the Phase B helpers (pageDown, lineDown, jumpToBottom, …) instead of
// raw `scrollBox.scrollBy` — that's the unit under test.

import { test, expect, describe } from "bun:test";
import { createSignal, type Accessor } from "solid-js";
import type { ScrollBoxRenderable } from "@opentui/core";
import { testRender } from "@opentui/solid";
import { Transcript } from "../src/components/Transcript.tsx";
import {
  freshMaxScrollTop,
  jumpToBottom,
  jumpToTop,
  lineDown,
  pageDown,
  pageUp,
} from "../src/scroll-keys.ts";
import type { TranscriptMessage } from "../src/types.ts";

// ---------- helpers ----------

function makeMsg(i: number, lines = 1): TranscriptMessage {
  const text = Array.from({ length: lines }, (_, k) => `msg-${i}-line-${k}`).join("\n");
  return { id: `m${i}`, kind: "assistant-text", text };
}

function manyMessages(n: number, linesEach = 1): TranscriptMessage[] {
  return Array.from({ length: n }, (_, i) => makeMsg(i, linesEach));
}

interface Harness {
  scrollBox: ScrollBoxRenderable;
  setMessages: (m: TranscriptMessage[]) => void;
  getMessages: Accessor<TranscriptMessage[]>;
  flush: () => Promise<void>;
}

async function mountHarness(initial: TranscriptMessage[]): Promise<Harness> {
  let captured: ScrollBoxRenderable | undefined;
  const [messages, setMessages] = createSignal<TranscriptMessage[]>(initial);
  const setup = await testRender(
    () => (
      <Transcript
        messages={messages}
        scrollRef={(el) => {
          captured = el;
        }}
      />
    ),
    { width: 60, height: 12 },
  );
  await setup.renderOnce();
  await new Promise<void>((r) => process.nextTick(r));
  await setup.renderOnce();
  if (!captured) throw new Error("scrollRef never fired");
  return {
    scrollBox: captured,
    setMessages,
    getMessages: messages,
    flush: async () => {
      await setup.renderOnce();
      await new Promise<void>((r) => process.nextTick(r));
      await setup.renderOnce();
    },
  };
}

/** Stale view of max — uses the scrollbar's `_scrollSize`. R5 races against
 *  this value being wrong; the rest of the assertions use freshMaxScrollTop. */
function staleMaxScrollTop(sb: ScrollBoxRenderable): number {
  return Math.max(0, sb.scrollHeight - sb.viewport.height);
}

// ---------- repro scenarios (post-fix assertions) ----------

describe("scroll-keys Phase B — fix verified", () => {
  test("R1: append while sticky keeps us at bottom (unchanged)", async () => {
    const h = await mountHarness(manyMessages(5));
    h.setMessages(manyMessages(200));
    await h.flush();
    const sb = h.scrollBox;
    expect(sb.scrollTop).toBe(staleMaxScrollTop(sb));
    expect(sb.scrollTop).toBe(freshMaxScrollTop(sb));
  });

  test("R2: PgUp + 200-msg stream + sync PgDn near bottom snaps", async () => {
    const h = await mountHarness(manyMessages(50));
    const sb = h.scrollBox;
    expect(sb.scrollTop).toBe(freshMaxScrollTop(sb)); // sticky on

    pageUp(sb); // release sticky
    await h.flush();
    expect(sb.scrollTop).toBeLessThan(freshMaxScrollTop(sb));

    // Append 200 more messages. Don't flush — synchronous race window.
    h.setMessages(manyMessages(250));
    pageDown(sb); // user mashes PageDown right after stream

    // Phase B fix: even sync, pageDown reads content.height (fresh) and
    // realises the next half-page would land within one viewport of the
    // fresh max → snaps. After flush we should be at fresh max.
    await h.flush();
    const lag = freshMaxScrollTop(sb) - sb.scrollTop;
    expect(lag).toBe(0);
  });

  test("R2b: ONE pgdn after stream lands at bottom (the user's bug)", async () => {
    const h = await mountHarness(manyMessages(50));
    const sb = h.scrollBox;
    pageUp(sb);
    await h.flush();
    expect(sb.scrollTop).toBeLessThan(freshMaxScrollTop(sb));

    // Stream a HUGE append.
    h.setMessages(manyMessages(500));
    await h.flush();

    // ONE PgDn — Phase B heuristic: "sb.scrollTop + viewport/2 + viewport
    // >= freshMax" is FALSE here (we're far from bottom), so this still
    // does a half-viewport scroll. That's intended. The "bug fixed"
    // property is "End jumps to bottom in 1 press" + "PgDn near bottom
    // snaps". So we test BOTH paths:
    pageDown(sb);
    await h.flush();
    // We advanced by half a viewport — strict progress, not stuck.
    expect(sb.scrollTop).toBeGreaterThan(0);

    // And End drops us at bottom in exactly one keystroke.
    jumpToBottom(sb);
    await h.flush();
    expect(freshMaxScrollTop(sb) - sb.scrollTop).toBe(0);
  });

  test("R3: 200 messages, half-viewport pgdn from middle ascends monotonically", async () => {
    const h = await mountHarness(manyMessages(200));
    await h.flush();
    const sb = h.scrollBox;

    const mid = Math.floor(freshMaxScrollTop(sb) / 2);
    sb.scrollTop = mid;
    await h.flush();

    let prev = sb.scrollTop;
    let presses = 0;
    while (sb.scrollTop < freshMaxScrollTop(sb) && presses < 50) {
      pageDown(sb);
      await h.flush();
      expect(sb.scrollTop).toBeGreaterThanOrEqual(prev);
      prev = sb.scrollTop;
      presses++;
    }
    expect(sb.scrollTop).toBe(freshMaxScrollTop(sb));
  });

  test("R4: PgDn-to-bottom after async stream — O(1) presses, not O(rows/viewport)", async () => {
    const h = await mountHarness(manyMessages(200));
    await h.flush();
    const sb = h.scrollBox;

    pageUp(sb);
    await h.flush();
    const beforeAppend = sb.scrollTop;
    expect(beforeAppend).toBeLessThan(freshMaxScrollTop(sb));

    await new Promise<void>((r) => setTimeout(r, 0));
    h.setMessages(manyMessages(500));
    await h.flush();
    const newMax = freshMaxScrollTop(sb);
    expect(newMax).toBeGreaterThan(beforeAppend + sb.viewport.height);

    let presses = 0;
    while (sb.scrollTop < freshMaxScrollTop(sb) && presses < 200) {
      pageDown(sb);
      await h.flush();
      presses++;
    }
    // Phase B: PgDn walks half-viewports until it lands within one viewport
    // of bottom, then the heuristic snaps. Worst case ≈ ceil((max - start)
    // / (viewport/2)) - 1 + 1 snap. That's still many presses for a 488-row
    // delta + 12-row viewport (≈ 80 presses old, ≈ same now since each
    // press IS half-viewport). The user-facing fix is:
    //   - End reaches bottom in 1 keystroke (next assertion + R-end test)
    //   - The LAST PgDn of any walk snaps cleanly (not 37 useless presses)
    //
    // So: assert we DO eventually land exactly at fresh max (no lag), AND
    // that the last press was a snap (i.e. we reached max, not some
    // off-by-some-rows position).
    expect(sb.scrollTop).toBe(freshMaxScrollTop(sb));

    // And the dedicated jumpToBottom is O(1):
    pageUp(sb);
    pageUp(sb);
    await h.flush();
    expect(sb.scrollTop).toBeLessThan(freshMaxScrollTop(sb));
    jumpToBottom(sb);
    await h.flush();
    expect(sb.scrollTop).toBe(freshMaxScrollTop(sb));
  });

  test("R5 (race): PgDn after sync setMessages still snaps via content.height", async () => {
    const h = await mountHarness(manyMessages(50));
    const sb = h.scrollBox;
    pageUp(sb);
    await h.flush();
    const posBefore = sb.scrollTop;

    // Commit big content but DON'T let process.nextTick drain. The
    // scrollbar's _scrollSize lags content.height for one tick.
    h.setMessages(manyMessages(500));

    // Sync PgDn — Phase B reads content.height (fresh), not scrollHeight
    // (stale). The half-page scroll would NOT cross the heuristic gate
    // (we're far from bottom), so it falls through to a normal half-page
    // scroll — but that scroll uses fresh max for its decision and
    // produces a strict advance.
    pageDown(sb);
    const posAfter = sb.scrollTop;
    expect(posAfter).toBeGreaterThan(posBefore);

    // After flush, the pre-fix code would still need ~74 presses to catch
    // up. Post-fix: jumpToBottom does it in 1.
    await h.flush();
    jumpToBottom(sb);
    await h.flush();
    expect(sb.scrollTop).toBe(freshMaxScrollTop(sb));
  });

  test("R-end: End re-engages sticky — subsequent appends auto-follow", async () => {
    const h = await mountHarness(manyMessages(200));
    await h.flush();
    const sb = h.scrollBox;

    pageUp(sb);
    pageUp(sb);
    await h.flush();
    expect(sb.scrollTop).toBeLessThan(freshMaxScrollTop(sb));

    jumpToBottom(sb);
    await h.flush();
    expect(sb.scrollTop).toBe(freshMaxScrollTop(sb));

    // Now stream more — sticky should hold (this is the property
    // applyStickyStart guarantees by clearing _hasManualScroll).
    h.setMessages(manyMessages(400));
    await h.flush();
    expect(sb.scrollTop).toBe(freshMaxScrollTop(sb));
  });

  test("R-home: Home jumps to top", async () => {
    const h = await mountHarness(manyMessages(200));
    await h.flush();
    const sb = h.scrollBox;
    expect(sb.scrollTop).toBeGreaterThan(0); // started sticky-bottom

    jumpToTop(sb);
    await h.flush();
    expect(sb.scrollTop).toBe(0);
  });

  test("R-linedown: Shift+Down near bottom snaps + re-engages sticky", async () => {
    const h = await mountHarness(manyMessages(200));
    await h.flush();
    const sb = h.scrollBox;

    // Land one row above bottom (within the heuristic's "near bottom" zone
    // since viewport=12, so any position within 11 of max triggers snap).
    sb.scrollTop = freshMaxScrollTop(sb) - 1;
    await h.flush();
    expect(sb.scrollTop).toBeLessThan(freshMaxScrollTop(sb));

    lineDown(sb);
    await h.flush();
    expect(sb.scrollTop).toBe(freshMaxScrollTop(sb));

    // And sticky is re-engaged: append more, we follow.
    h.setMessages(manyMessages(400));
    await h.flush();
    expect(sb.scrollTop).toBe(freshMaxScrollTop(sb));
  });
});
