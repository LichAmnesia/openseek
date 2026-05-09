import { expect, test } from "bun:test";
import { PACKAGE_NAME } from "../src/index.ts";

test("agent package identifies itself", () => {
  expect(PACKAGE_NAME).toBe("@openseek/agent");
});
