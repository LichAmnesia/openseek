import { afterEach, beforeEach, expect, test } from "bun:test";
import { join } from "node:path";
import notebookEdit from "../src/tools/notebook_edit.ts";
import { cleanupTmpDir, makeCtx, makeTmpDir } from "./helpers.ts";

let cwd: string;

beforeEach(() => {
  cwd = makeTmpDir("openseek-notebook-edit-");
});

afterEach(() => {
  cleanupTmpDir(cwd);
});

const sampleNotebook = {
  cells: [
    { cell_type: "markdown", source: ["# Title\n", "intro"] },
    { cell_type: "code", source: "print('hi')\n", outputs: [], execution_count: null },
  ],
  metadata: { kernelspec: { name: "python3" } },
  nbformat: 4,
  nbformat_minor: 5,
};

test("notebook_edit replaces a cell's source by index", async () => {
  await Bun.write(
    join(cwd, "nb.ipynb"),
    JSON.stringify(sampleNotebook, null, 2),
  );
  const result = await notebookEdit.call(
    { path: "nb.ipynb", cellIndex: 1, newSource: "print('changed')\n" },
    makeCtx(cwd),
  );
  expect(result.kind).toBe("diff");
  const updated = JSON.parse(await Bun.file(join(cwd, "nb.ipynb")).text());
  expect(updated.cells[1].source).toBe("print('changed')\n");
  expect(updated.cells[0].source).toEqual(["# Title\n", "intro"]);
  expect(updated.nbformat).toBe(4);
});

test("notebook_edit can change cell_type and drops outputs for non-code", async () => {
  await Bun.write(
    join(cwd, "nb.ipynb"),
    JSON.stringify(sampleNotebook, null, 2),
  );
  const result = await notebookEdit.call(
    {
      path: "nb.ipynb",
      cellIndex: 1,
      newSource: "## Now markdown",
      cellType: "markdown",
    },
    makeCtx(cwd),
  );
  expect(result.kind).toBe("diff");
  const updated = JSON.parse(await Bun.file(join(cwd, "nb.ipynb")).text());
  expect(updated.cells[1].cell_type).toBe("markdown");
  expect(updated.cells[1].source).toBe("## Now markdown");
  expect(updated.cells[1].outputs).toBeUndefined();
  expect(updated.cells[1].execution_count).toBeUndefined();
});

test("notebook_edit errors on out-of-range index", async () => {
  await Bun.write(
    join(cwd, "nb.ipynb"),
    JSON.stringify(sampleNotebook, null, 2),
  );
  const result = await notebookEdit.call(
    { path: "nb.ipynb", cellIndex: 99, newSource: "x" },
    makeCtx(cwd),
  );
  expect(result.kind).toBe("error");
  if (result.kind !== "error") throw new Error("unreachable");
  expect(result.message).toContain("out of range");
});

test("notebook_edit errors on invalid JSON", async () => {
  await Bun.write(join(cwd, "broken.ipynb"), "not-json");
  const result = await notebookEdit.call(
    { path: "broken.ipynb", cellIndex: 0, newSource: "x" },
    makeCtx(cwd),
  );
  expect(result.kind).toBe("error");
  if (result.kind !== "error") throw new Error("unreachable");
  expect(result.message).toContain("invalid notebook JSON");
});

test("notebook_edit refuses non-ipynb extension", async () => {
  await Bun.write(join(cwd, "nb.txt"), "{}");
  const result = await notebookEdit.call(
    { path: "nb.txt", cellIndex: 0, newSource: "x" },
    makeCtx(cwd),
  );
  expect(result.kind).toBe("error");
  if (result.kind !== "error") throw new Error("unreachable");
  expect(result.message).toContain("not a .ipynb file");
});
