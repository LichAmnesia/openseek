import { test, expect } from "bun:test";
import { _internals, detectLocale, isLocale, listKeys, t } from "../src/i18n.ts";

test("every key is present in both en and zh-Hans dicts", () => {
  const keys = listKeys();
  expect(keys.length).toBeGreaterThanOrEqual(30);
  for (const k of keys) {
    expect(_internals.EN[k]).toBeTruthy();
    expect(_internals.ZH_HANS[k]).toBeTruthy();
  }
});

test("default locale is en when no env hints", () => {
  expect(detectLocale({})).toBe("en");
});

test("OPENSEEK_LOCALE overrides system env", () => {
  expect(detectLocale({ OPENSEEK_LOCALE: "zh-Hans", LANG: "en_US.UTF-8" })).toBe("zh-Hans");
});

test("LANG zh* falls through to zh-Hans", () => {
  expect(detectLocale({ LANG: "zh_CN.UTF-8" })).toBe("zh-Hans");
  expect(detectLocale({ LC_ALL: "zh_TW.UTF-8" })).toBe("zh-Hans");
});

test("t returns localized string for both locales", () => {
  expect(t("status.idle", "en")).toBe("idle");
  expect(t("status.idle", "zh-Hans")).toBe("空闲");
  expect(t("composer.send", "zh-Hans")).toBe("发送");
});

test("t returns key itself for unknown keys", () => {
  expect(t("no.such.key", "en")).toBe("no.such.key");
  expect(t("no.such.key", "zh-Hans")).toBe("no.such.key");
});

test("isLocale narrows correctly", () => {
  expect(isLocale("en")).toBe(true);
  expect(isLocale("zh-Hans")).toBe(true);
  expect(isLocale("fr")).toBe(false);
  expect(isLocale(undefined)).toBe(false);
});
