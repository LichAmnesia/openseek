import { expect, test } from "bun:test";
import snip from "../src/tools/snip.ts";
import { makeCtx, makeTmpDir } from "./helpers.ts";

test("snip returns plan marker when messages omitted", async () => {
  const result = await snip.call({ startIdx: 4, endIdx: 6 }, makeCtx(makeTmpDir("x")));
  expect(result.kind).toBe("text");
  if (result.kind !== "text") throw new Error("unreachable");
  expect(result.text).toContain("snip plan");
  expect(result.text).toContain("3 message(s)");
});

test("snip applies splice on inclusive range", async () => {
  const messages = [
    { role: "user", content: "0" },
    { role: "assistant", content: "1" },
    { role: "user", content: "2" },
    { role: "assistant", content: "3" },
    { role: "user", content: "4" },
  ];
  const result = await snip.call(
    { startIdx: 1, endIdx: 3, messages },
    makeCtx(makeTmpDir("x")),
  );
  if (result.kind !== "text") throw new Error("unreachable");
  expect(result.text).toContain("dropped 3");
  expect(result.text).toContain("kept 2");
});

test("snip rejects invalid range with error result", async () => {
  const messages = [
    { role: "user", content: "a" },
    { role: "user", content: "b" },
  ];
  const result = await snip.call(
    { startIdx: 5, endIdx: 9, messages },
    makeCtx(makeTmpDir("x")),
  );
  expect(result.kind).toBe("error");
  if (result.kind !== "error") throw new Error("unreachable");
  expect(result.message).toContain("invalid range");
});

test("snip mirrors snipCompact contract — same range, same drop count", async () => {
  // This anchor test pins the byte-for-byte contract with
  // packages/session/src/compact/snip.ts. If snipCompact's behaviour ever
  // changes, this test should change too.
  const messages = [
    { role: "user", content: "x0" },
    { role: "user", content: "x1" },
    { role: "user", content: "x2" },
    { role: "user", content: "x3" },
  ];
  const result = await snip.call(
    { startIdx: 1, endIdx: 2, messages },
    makeCtx(makeTmpDir("x")),
  );
  if (result.kind !== "text") throw new Error("unreachable");
  expect(result.text).toContain("dropped 2");
  expect(result.text).toContain("kept 2");
});
