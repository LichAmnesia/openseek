// e2e: cancel flow (G7.2 #6).
// Pre-aborted, mid-text, and double-Ctrl-C-style cancel surfaces.

import { describe, expect, test } from "bun:test";
import {
  createDoubleCtrlCDetector,
} from "@openseek/tui";
import { runSession } from "@openseek/session";
import {
  capability,
  createMockModel,
  fakeProvider,
  textChunks,
  userMsg,
} from "./_harness.ts";

describe("e2e: cancel flow", () => {
  test("pre-aborted signal yields cancelled and never starts the stream", async () => {
    const ac = new AbortController();
    ac.abort();
    const handle = createMockModel({ phases: [{ chunks: textChunks("never") }] });
    const events: unknown[] = [];
    for await (const ev of runSession(
      {
        messages: [userMsg("hi")],
        mode: "agent",
        reasoningEffort: "off",
        model: "mock-model",
        provider: "mock",
      },
      {
        provider: fakeProvider(handle.model),
        model: "mock-model",
        tools: new Map(),
        capability: capability(),
        signal: ac.signal,
      },
    )) {
      events.push(ev);
    }
    expect(events).toHaveLength(1);
    expect((events[0] as { type: string }).type).toBe("cancelled");
  });

  test("mid-text abort surfaces a {type:'cancelled'} event", async () => {
    const ac = new AbortController();
    const handle = createMockModel({
      phases: [{ chunks: textChunks("partial answer that...") }],
    });
    const events: { type: string }[] = [];
    for await (const ev of runSession(
      {
        messages: [userMsg("hi")],
        mode: "agent",
        reasoningEffort: "off",
        model: "mock-model",
        provider: "mock",
      },
      {
        provider: fakeProvider(handle.model),
        model: "mock-model",
        tools: new Map(),
        capability: capability(),
        signal: ac.signal,
      },
    )) {
      events.push(ev as { type: string });
      if (ev.type === "text-delta") ac.abort();
    }
    expect(events.some((e) => e.type === "cancelled")).toBe(true);
  });

  test("double-Ctrl-C detector returns 'exit' on the second press inside the window", () => {
    const det = createDoubleCtrlCDetector({ timeoutMs: 1000 });
    const t0 = 1000;
    const a = det.press(t0);
    expect(a).toBe("cancel");
    const b = det.press(t0 + 100);
    expect(b).toBe("exit");
  });
});
