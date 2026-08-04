import { expect, test } from "bun:test";
import { buildOneShotMessages, ONE_SHOT_AUTONOMY_DIRECTIVE } from "../src/index.ts";

// Regression: a `-p` run has no human to answer follow-up questions, so the
// one-shot message stack must lead with an autonomy directive. Without it the
// model finishes one phase and stops to ask "should I continue?"; the no-tool
// turn then ends the run as "completed" while the task is only half done.

function textOf(msg: { content: Array<{ type: string; text?: string }> }): string {
  return msg.content.map((c) => c.text ?? "").join("");
}

test("autonomy directive tells the model it is non-interactive and must not stop to ask", () => {
  expect(ONE_SHOT_AUTONOMY_DIRECTIVE).toContain("NON-INTERACTIVE");
  expect(ONE_SHOT_AUTONOMY_DIRECTIVE.toLowerCase()).toContain("do not stop to ask");
});

test("buildOneShotMessages leads with the autonomy directive, then the user prompt", () => {
  const msgs = buildOneShotMessages("do the whole task", null);
  expect(msgs.length).toBe(2);
  expect(msgs[0]?.role).toBe("system");
  expect(textOf(msgs[0] as never)).toBe(ONE_SHOT_AUTONOMY_DIRECTIVE);
  const last = msgs[msgs.length - 1];
  expect(last?.role).toBe("user");
  expect(textOf(last as never)).toContain("do the whole task");
});

test("AGENTS.md context is inserted between the directive and the user prompt", () => {
  const msgs = buildOneShotMessages("run it", "# Project rules\nBe careful.");
  expect(msgs.length).toBe(3);
  // Directive is still first so autonomy is never overridden by project text.
  expect(textOf(msgs[0] as never)).toBe(ONE_SHOT_AUTONOMY_DIRECTIVE);
  expect(msgs[1]?.role).toBe("system");
  expect(textOf(msgs[1] as never)).toContain("Project rules");
  expect(msgs[2]?.role).toBe("user");
});
