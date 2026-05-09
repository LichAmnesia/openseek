// e2e: i18n flow (G7.2 #11).
// English vs zh-Hans translation paths.

import { describe, expect, test } from "bun:test";
import { detectLocale, isLocale, listKeys, t } from "@openseek/tui";

describe("e2e: i18n flow", () => {
  test("en locale renders ASCII strings", () => {
    expect(t("status.idle", "en")).toMatch(/[A-Za-z]/);
    expect(t("composer.placeholder", "en")).toMatch(/[A-Za-z]/);
  });

  test("zh-Hans locale renders Chinese ideographs for the same keys", () => {
    const idle = t("status.idle", "zh-Hans");
    expect(/[一-鿿]/.test(idle)).toBe(true);
    const exit = t("composer.exit", "zh-Hans");
    expect(/[一-鿿]/.test(exit) || /[A-Za-z]/.test(exit)).toBe(true);
  });

  test("detectLocale falls through env LANG to zh-Hans on zh*", () => {
    expect(detectLocale({ LANG: "zh_CN.UTF-8" } as unknown as NodeJS.ProcessEnv)).toBe("zh-Hans");
    expect(detectLocale({ LANG: "en_US.UTF-8" } as unknown as NodeJS.ProcessEnv)).toBe("en");
    expect(isLocale("en")).toBe(true);
    expect(isLocale("fr")).toBe(false);
    expect(listKeys().length).toBeGreaterThan(0);
  });
});
