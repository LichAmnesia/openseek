import { test, expect } from "bun:test";
import { splitSystemPrefix } from "../src/transform.ts";
import type { OpenSeekMessage } from "@openseek/provider";

const sysMsg = (text: string): OpenSeekMessage => ({
  role: "system",
  content: [{ type: "text", text }],
});
const userMsg = (text: string): OpenSeekMessage => ({
  role: "user",
  content: [{ type: "text", text }],
});

test("no system prefix returns empty system + identical rest", () => {
  const msgs = [userMsg("hi")];
  const { system, rest } = splitSystemPrefix(msgs);
  expect(system).toBe("");
  expect(rest).toEqual(msgs);
});

test("single leading system lifted out", () => {
  const msgs = [sysMsg("be helpful"), userMsg("hi")];
  const { system, rest } = splitSystemPrefix(msgs);
  expect(system).toBe("be helpful");
  expect(rest).toHaveLength(1);
  expect(rest[0]?.role).toBe("user");
});

test("multiple leading system messages joined with double newline", () => {
  const msgs = [sysMsg("rule 1"), sysMsg("rule 2"), userMsg("hi")];
  const { system, rest } = splitSystemPrefix(msgs);
  expect(system).toBe("rule 1\n\nrule 2");
  expect(rest).toHaveLength(1);
});

test("empty system content blocks are filtered out", () => {
  const msgs: OpenSeekMessage[] = [
    { role: "system", content: [{ type: "text", text: "" }] },
    sysMsg("real rule"),
    userMsg("hi"),
  ];
  const { system, rest } = splitSystemPrefix(msgs);
  expect(system).toBe("real rule");
  expect(rest).toHaveLength(1);
});

test("system message after a user message stays in messages array (not lifted)", () => {
  const msgs = [userMsg("hi"), sysMsg("late instruction"), userMsg("again")];
  const { system, rest } = splitSystemPrefix(msgs);
  expect(system).toBe("");
  expect(rest).toHaveLength(3);
  expect(rest[1]?.role).toBe("system");
});

test("does not mutate input array", () => {
  const msgs = [sysMsg("x"), userMsg("y")];
  const before = [...msgs];
  splitSystemPrefix(msgs);
  expect(msgs).toEqual(before);
});
