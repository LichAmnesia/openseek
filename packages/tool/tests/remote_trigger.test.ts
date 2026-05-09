import { afterEach, expect, test } from "bun:test";
import remoteTrigger, {
  setRemoteTriggerFetch,
} from "../src/tools/remote_trigger.ts";
import { makeCtx, makeTmpDir } from "./helpers.ts";

afterEach(() => setRemoteTriggerFetch(undefined));

test("remote_trigger schema rejects malformed url", () => {
  const parsed = remoteTrigger.inputSchema.safeParse({ url: "not-a-url" });
  expect(parsed.success).toBe(false);
});

test("remote_trigger POSTs payload + extra headers", async () => {
  let captured: { url: string; init?: RequestInit } | undefined;
  setRemoteTriggerFetch((async (url: unknown, init?: RequestInit) => {
    captured = { url: String(url), init };
    return new Response("OK", { status: 200 });
  }) as unknown as typeof fetch);

  const result = await remoteTrigger.call(
    {
      url: "https://hooks.example.com/deploy",
      payload: { ref: "main" },
      headers: { Authorization: "Bearer abc" },
    },
    makeCtx(makeTmpDir("rt-")),
  );
  expect(captured?.url).toBe("https://hooks.example.com/deploy");
  expect(captured?.init?.method).toBe("POST");
  const sentHeaders = captured?.init?.headers as Record<string, string> | undefined;
  expect(sentHeaders?.Authorization).toBe("Bearer abc");
  expect(JSON.parse(String(captured?.init?.body))).toEqual({ ref: "main" });

  expect(result.kind).toBe("text");
  if (result.kind !== "text") throw new Error("unreachable");
  expect(result.text).toContain("200");
  expect(result.text).toContain("OK");
});

test("remote_trigger surfaces non-2xx as error", async () => {
  setRemoteTriggerFetch((async () =>
    new Response("nope", { status: 500, statusText: "boom" })) as unknown as typeof fetch);
  const result = await remoteTrigger.call(
    { url: "https://hooks.example.com/x" },
    makeCtx(makeTmpDir("rt-")),
  );
  expect(result.kind).toBe("error");
  if (result.kind !== "error") throw new Error("unreachable");
  expect(result.message).toContain("500");
  expect(result.message).toContain("nope");
});

test("remote_trigger surfaces network errors", async () => {
  setRemoteTriggerFetch((async () => {
    throw new Error("ECONNREFUSED");
  }) as unknown as typeof fetch);
  const result = await remoteTrigger.call(
    { url: "https://hooks.example.com/x" },
    makeCtx(makeTmpDir("rt-")),
  );
  expect(result.kind).toBe("error");
  if (result.kind !== "error") throw new Error("unreachable");
  expect(result.message).toContain("ECONNREFUSED");
});
