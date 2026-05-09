import { describe, expect, test } from "bun:test";
import { cycleEffort, cycleMode } from "../src/cycle.ts";

describe("cycleMode", () => {
  test("plan → agent → yolo → plan", () => {
    expect(cycleMode("plan")).toBe("agent");
    expect(cycleMode("agent")).toBe("yolo");
    expect(cycleMode("yolo")).toBe("plan");
  });

  test("three Tab presses return to start", () => {
    let m = "plan" as ReturnType<typeof cycleMode>;
    for (let i = 0; i < 3; i++) m = cycleMode(m);
    expect(m).toBe("plan");
  });
});

describe("cycleEffort", () => {
  test("off → high → max → off", () => {
    expect(cycleEffort("off")).toBe("high");
    expect(cycleEffort("high")).toBe("max");
    expect(cycleEffort("max")).toBe("off");
  });

  test("three Shift+Tab presses return to start", () => {
    let e = "off" as ReturnType<typeof cycleEffort>;
    for (let i = 0; i < 3; i++) e = cycleEffort(e);
    expect(e).toBe("off");
  });
});
