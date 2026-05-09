import { afterEach, beforeEach, expect, test } from "bun:test";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import sendUserFile, {
  setSendUserFileHandler,
} from "../src/tools/send_user_file.ts";
import { cleanupTmpDir, makeCtx, makeTmpDir } from "./helpers.ts";

let cwd: string;

beforeEach(() => {
  cwd = makeTmpDir("openseek-send-user-file-");
});

afterEach(() => {
  cleanupTmpDir(cwd);
  setSendUserFileHandler(undefined);
});

test("send_user_file emits markdown link for an existing file", async () => {
  writeFileSync(join(cwd, "report.md"), "hi");
  const result = await sendUserFile.call(
    { path: "report.md", caption: "see report" },
    makeCtx(cwd),
  );
  expect(result.kind).toBe("text");
  if (result.kind !== "text") throw new Error("unreachable");
  expect(result.text).toContain("[report.md](report.md)");
  expect(result.text).toContain("see report");
});

test("send_user_file errors when file is missing", async () => {
  const result = await sendUserFile.call({ path: "absent.md" }, makeCtx(cwd));
  expect(result.kind).toBe("error");
  if (result.kind !== "error") throw new Error("unreachable");
  expect(result.message).toContain("does not exist");
});

test("send_user_file invokes handler with absolute + relative paths", async () => {
  writeFileSync(join(cwd, "a.md"), "x");
  let captured: { abs: string; relToCwd: string; caption?: string } | undefined;
  setSendUserFileHandler((f) => {
    captured = f;
  });
  const result = await sendUserFile.call(
    { path: "a.md", caption: "preview me" },
    makeCtx(cwd),
  );
  expect(result.kind).toBe("text");
  expect(captured?.relToCwd).toBe("a.md");
  expect(captured?.abs.endsWith("a.md")).toBe(true);
  expect(captured?.caption).toBe("preview me");
});

test("send_user_file rejects path that escapes workspace", async () => {
  const result = await sendUserFile.call({ path: "../../etc/passwd" }, makeCtx(cwd));
  expect(result.kind).toBe("error");
  if (result.kind !== "error") throw new Error("unreachable");
  expect(result.message).toContain("escapes workspace");
});
