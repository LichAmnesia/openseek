import { test, expect } from "bun:test";
import { PACKAGE_NAME } from "../src/index.ts";

test("mcp package identifies itself", () => {
  expect(PACKAGE_NAME).toBe("@openseek/mcp");
});
