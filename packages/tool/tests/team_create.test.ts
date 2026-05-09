import { afterEach, beforeEach, expect, test } from "bun:test";
import { openTaskStore, setDefaultTaskStore, type TaskStore } from "../src/sqlite-store.ts";
import teamCreate from "../src/tools/team_create.ts";
import { makeCtx, makeTmpDir } from "./helpers.ts";

let store: TaskStore;

beforeEach(() => {
  store = openTaskStore(":memory:");
  setDefaultTaskStore(store);
});

afterEach(() => {
  setDefaultTaskStore(null);
});

test("team_create stores entry with members", async () => {
  const result = await teamCreate.call(
    { name: "research-pod", members: ["alice", "bob"] },
    makeCtx(makeTmpDir("x")),
  );
  expect(result.kind).toBe("text");
  if (result.kind !== "text") throw new Error("unreachable");
  expect(result.text).toContain("research-pod");
  const teams = store.listTeams();
  expect(teams.length).toBe(1);
  const entry = teams[0];
  if (!entry) throw new Error("expected one team entry");
  expect(entry.name).toBe("research-pod");
  expect(entry.members).toEqual(["alice", "bob"]);
});

test("team_create defaults to empty roster when members omitted", async () => {
  await teamCreate.call({ name: "solo" }, makeCtx(makeTmpDir("x")));
  const entry = store.listTeams()[0];
  if (!entry) throw new Error("expected one team entry");
  expect(entry.members).toEqual([]);
});
