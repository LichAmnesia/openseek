import { test, expect } from "bun:test";
import { parseSkillDoc } from "../src/frontmatter.ts";

test("parses scalar / list / boolean / number frontmatter", () => {
  const raw = `---
name: alpha
description: "Hello, world"
version: 1.2.3
enabled: true
count: 7
tags: [a, b, c]
allowTools:
  - read
  - bash
---
# body
text after.
`;
  const r = parseSkillDoc(raw);
  expect(r.frontmatter.name).toBe("alpha");
  expect(r.frontmatter.description).toBe("Hello, world");
  expect(r.frontmatter.version).toBe("1.2.3");
  expect(r.frontmatter.enabled).toBe(true);
  expect(r.frontmatter.count).toBe(7);
  expect(r.frontmatter.tags).toEqual(["a", "b", "c"]);
  expect(r.frontmatter.allowTools).toEqual(["read", "bash"]);
  expect(r.body).toContain("# body");
});

test("returns empty frontmatter when none present", () => {
  const r = parseSkillDoc("plain markdown\nsecond line\n");
  expect(r.frontmatter).toEqual({});
  expect(r.body).toContain("plain markdown");
});
