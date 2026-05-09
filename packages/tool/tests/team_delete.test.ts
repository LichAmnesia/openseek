import { afterEach, beforeEach, expect, test } from "bun:test";
import { openTaskStore, setDefaultTaskStore, type TaskStore } from "../src/sqlite-store.ts";
import teamDelete from "../src/tools/team_delete.ts";
import { makeCtx, makeTmpDir } from "./helpers.ts";

let store: TaskStore;

beforeEach(() => {
  store = openTaskStore(":memory:");
  setDefaultTaskStore(store);
});

afterEach(() => {
  setDefaultTaskStore(null);
});

test("team_delete removes existing entry", async () => {
  store.insertTeam({ id: "team-1", name: "alpha", members: ["a"] });
  const result = await teamDelete.call({ id: "team-1" }, makeCtx(makeTmpDir("x")));
  expect(result.kind).toBe("text");
  expect(store.getTeam("team-1")).toBeNull();
});

test("team_delete returns error for unknown id", async () => {
  const result = await teamDelete.call({ id: "ghost" }, makeCtx(makeTmpDir("x")));
  expect(result.kind).toBe("error");
  if (result.kind !== "error") throw new Error("unreachable");
  expect(result.message).toContain("team not found");
});
