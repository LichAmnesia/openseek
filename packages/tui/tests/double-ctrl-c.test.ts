import { test, expect } from "bun:test";
import { createDoubleCtrlCDetector } from "../src/double-ctrl-c.ts";

test("first press returns 'cancel'", () => {
  const det = createDoubleCtrlCDetector();
  expect(det.press(0)).toBe("cancel");
});

test("second press within 1.5s returns 'exit'", () => {
  const det = createDoubleCtrlCDetector();
  expect(det.press(0)).toBe("cancel");
  expect(det.press(500)).toBe("exit");
});

test("second press exactly at boundary (1500ms) still exits", () => {
  const det = createDoubleCtrlCDetector();
  det.press(0);
  expect(det.press(1500)).toBe("exit");
});

test("press > 1500ms after the first goes back to 'cancel'", () => {
  const det = createDoubleCtrlCDetector();
  det.press(0);
  expect(det.press(1501)).toBe("cancel");
});

test("after exit, third press resets to cancel", () => {
  const det = createDoubleCtrlCDetector();
  det.press(0);
  det.press(100); // exit
  expect(det.press(200)).toBe("cancel");
});

test("reset() clears in-flight first press", () => {
  const det = createDoubleCtrlCDetector();
  det.press(0);
  det.reset();
  expect(det.press(100)).toBe("cancel");
});

test("custom timeoutMs is honoured", () => {
  const det = createDoubleCtrlCDetector({ timeoutMs: 100 });
  det.press(0);
  expect(det.press(101)).toBe("cancel"); // beyond custom window
});

test("custom now() clock is used when caller omits explicit time", () => {
  let t = 0;
  const det = createDoubleCtrlCDetector({ now: () => t });
  expect(det.press()).toBe("cancel");
  t = 200;
  expect(det.press()).toBe("exit");
});
