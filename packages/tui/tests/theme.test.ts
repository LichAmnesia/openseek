import { test, expect, beforeEach } from "bun:test";
import {
  defaultTheme,
  themeKeys,
  THEMES,
  THEME_NAMES,
  currentTheme,
  currentThemeName,
  setCurrentTheme,
} from "../src/theme.ts";

const HEX_RE = /^#[0-9a-fA-F]{6}$/;

beforeEach(() => {
  // Tests can flip the global theme signal; reset before each so order
  // independence is preserved.
  setCurrentTheme("default");
});

test("defaultTheme has all 8 required keys", () => {
  for (const key of themeKeys) {
    expect(defaultTheme[key]).toBeDefined();
  }
  expect(themeKeys.length).toBe(8);
});

test("defaultTheme values are 6-digit hex strings", () => {
  for (const key of themeKeys) {
    expect(typeof defaultTheme[key]).toBe("string");
    expect(defaultTheme[key]).toMatch(HEX_RE);
  }
});

test("thinking colour is gray-ish on the default palette (G1.4 visual contract)", () => {
  expect(defaultTheme.thinking).toBe("#6b7280");
});

test("splash colour is mikan-orange on the default palette (project accent)", () => {
  expect(defaultTheme.splash).toBe("#fb923c");
});

// ---- Batch-3: theme registry + reactive switch ----

test("THEMES exposes all 4 named palettes", () => {
  expect(Object.keys(THEMES).sort()).toEqual(
    ["dark", "default", "high-contrast", "light"].sort(),
  );
  expect(THEME_NAMES).toContain("default");
  expect(THEME_NAMES).toContain("dark");
  expect(THEME_NAMES).toContain("light");
  expect(THEME_NAMES).toContain("high-contrast");
});

test("each theme defines all 8 required keys with hex values", () => {
  for (const name of THEME_NAMES) {
    const t = THEMES[name];
    for (const key of themeKeys) {
      expect(t[key]).toBeDefined();
      expect(t[key]).toMatch(HEX_RE);
    }
  }
});

test("currentTheme starts at the default palette", () => {
  expect(currentThemeName()).toBe("default");
  expect(currentTheme().user).toBe(THEMES.default.user);
});

test("setCurrentTheme('dark') flips the live palette", () => {
  setCurrentTheme("dark");
  expect(currentThemeName()).toBe("dark");
  expect(currentTheme().user).toBe(THEMES.dark.user);
});

test("setCurrentTheme propagates through the defaultTheme proxy", () => {
  expect(defaultTheme.user).toBe(THEMES.default.user);
  setCurrentTheme("dark");
  expect(defaultTheme.user).toBe(THEMES.dark.user);
  setCurrentTheme("light");
  expect(defaultTheme.user).toBe(THEMES.light.user);
  setCurrentTheme("high-contrast");
  expect(defaultTheme.user).toBe(THEMES["high-contrast"].user);
});

test("each non-default palette has a visibly different `user` colour", () => {
  // Anti-regression: theme switch is meaningless if dark/light/HC return
  // the same hex as default. Tests the visual-distinctness invariant.
  const def = THEMES.default.user;
  expect(THEMES.dark.user).not.toBe(def);
  expect(THEMES.light.user).not.toBe(def);
  expect(THEMES["high-contrast"].user).not.toBe(def);
});

test("each non-default palette has a visibly different `assistant` colour", () => {
  const def = THEMES.default.assistant;
  // dark may keep "#fafafa"-ish but should still differ; light should be dark.
  expect(THEMES.light.assistant).not.toBe(def);
  expect(THEMES["high-contrast"].assistant).not.toBe(def);
});

test("setCurrentTheme rejects unknown names (defensive guard)", () => {
  setCurrentTheme("dark");
  expect(currentThemeName()).toBe("dark");
  setCurrentTheme("not-a-real-theme");
  // Should remain at "dark" — invalid input is silently ignored. The
  // command handler enforces the whitelist before calling us.
  expect(currentThemeName()).toBe("dark");
});

test("setCurrentTheme round-trips through every named palette", () => {
  for (const name of THEME_NAMES) {
    setCurrentTheme(name);
    expect(currentThemeName()).toBe(name);
    expect(currentTheme()).toEqual(THEMES[name]);
  }
});
