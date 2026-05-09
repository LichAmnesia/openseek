import { expect, test } from "bun:test";
import { JsonRpcClient, LineFramer } from "../src/jsonrpc.ts";

test("JsonRpcClient resolves with the matching id", async () => {
  const sent: unknown[] = [];
  const client = new JsonRpcClient({ send: (m) => sent.push(m) });
  const p = client.call<{ ok: boolean }>("ping");
  const req = sent[0] as { id: number; method: string };
  expect(req.method).toBe("ping");
  client.receive({ jsonrpc: "2.0", id: req.id, result: { ok: true } });
  await expect(p).resolves.toEqual({ ok: true });
});

test("JsonRpcClient rejects on error response", async () => {
  const client = new JsonRpcClient({
    send: (m) => {
      const id = (m as { id?: number }).id;
      if (id !== undefined) {
        queueMicrotask(() =>
          client.receive({ jsonrpc: "2.0", id, error: { code: -1, message: "bad" } }),
        );
      }
    },
  });
  await expect(client.call("foo")).rejects.toThrow("bad");
});

test("JsonRpcClient close rejects pending calls", async () => {
  const client = new JsonRpcClient({ send: () => {} });
  const p = client.call("never");
  client.close("bye");
  await expect(p).rejects.toThrow("bye");
});

test("LineFramer dispatches one message per newline", () => {
  const out: unknown[] = [];
  const f = new LineFramer();
  f.push('{"a":1}\n{"a":2}\n', (m) => out.push(m));
  expect(out).toEqual([{ a: 1 }, { a: 2 }]);
});

test("LineFramer buffers a partial line until completed", () => {
  const out: unknown[] = [];
  const f = new LineFramer();
  f.push('{"hel', (m) => out.push(m));
  f.push('lo":1}\n', (m) => out.push(m));
  expect(out).toEqual([{ hello: 1 }]);
});

test("LineFramer skips malformed lines silently", () => {
  const out: unknown[] = [];
  const f = new LineFramer();
  f.push("not json\n", (m) => out.push(m));
  f.push('{"ok":true}\n', (m) => out.push(m));
  expect(out).toEqual([{ ok: true }]);
});
