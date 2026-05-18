// `openseek doctor` smoke — prints resolved config + per-field source.

import { test, expect } from "bun:test";
import { runDoctor } from "../src/doctor.ts";

function captureStdout(fn: () => void): string {
  const original = console.log;
  const lines: string[] = [];
  console.log = (...args: unknown[]) => {
    lines.push(args.map((a) => (typeof a === "string" ? a : String(a))).join(" "));
  };
  try {
    fn();
  } finally {
    console.log = original;
  }
  return lines.join("\n");
}

// Hermetic ioOverride so tests don't see the developer's real ~/.openseek/config.toml
// or live process.env. Each test passes the exact world it wants.
const cleanIO = (env: Record<string, string | undefined> = {}) => ({
  readFile: () => undefined,
  warn: () => {},
  home: "/tmp/doctor-test-home",
  env,
});

test("doctor prints resolved provider / model / api_key / base_url with source", () => {
  const out = captureStdout(() => {
    const r = runDoctor("/tmp/doctor-test-workspace", cleanIO());
    expect(r.exitCode).toBe(0);
  });
  expect(out).toContain("openseek doctor");
  expect(out).toContain("Resolved configuration:");
  expect(out).toContain("provider");
  expect(out).toContain("model");
  expect(out).toContain("api_key");
  expect(out).toContain("base_url");
  expect(out).toContain("Precedence (highest first):");
  expect(out).toContain("OPENSEEK_PROVIDER");
});

test("doctor masks api_key when set via env", () => {
  const out = captureStdout(() => {
    runDoctor("/tmp/doctor-test-workspace", cleanIO({ OPENSEEK_API_KEY: "sk-abcdef1234567890" }));
  });
  expect(out).toContain("sk-a…7890");
  expect(out).not.toContain("sk-abcdef1234567890");
});

test("doctor shows '(unset)' when api_key is missing", () => {
  const out = captureStdout(() => {
    runDoctor("/tmp/doctor-test-workspace", cleanIO());
  });
  expect(out).toContain("(unset)");
});

test("doctor labels source as 'env' when value comes from environment", () => {
  const out = captureStdout(() => {
    runDoctor("/tmp/doctor-test-workspace", cleanIO({ OPENSEEK_PROVIDER: "anthropic" }));
  });
  expect(out).toMatch(/provider\s+anthropic\s+.*← env/);
});
