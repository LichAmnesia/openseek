import { test, expect } from "bun:test";
import { PACKAGE_NAME } from "../src/index.ts";

test("command package identifies itself", () => {
  expect(PACKAGE_NAME).toBe("@openseek/command");
});
