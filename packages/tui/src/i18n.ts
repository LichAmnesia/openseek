// TUI i18n — en + zh-Hans (G6.6).
//
// Tiny in-memory dictionary covering the user-visible strings we render
// today: status bar pieces, splash banner, prompts, error banners, exit
// hints. Keys are stable; missing translations fall back to the key itself
// so a forgotten string ships with a debuggable placeholder rather than a
// blank cell.
//
// Locale resolution order:
//   1. explicit arg
//   2. process.env.OPENSEEK_LOCALE
//   3. process.env.LC_ALL / LC_MESSAGES / LANG  (zh* → zh-Hans)
//   4. "en"

export type Locale = "en" | "zh-Hans";

export const LOCALES: Locale[] = ["en", "zh-Hans"];

export type I18nKey =
  // status bar / splash
  | "splash.title"
  | "splash.subtitle"
  | "status.idle"
  | "status.streaming"
  | "status.cancelled"
  | "status.error"
  | "status.mode.plan"
  | "status.mode.agent"
  | "status.mode.yolo"
  | "status.effort.off"
  | "status.effort.high"
  | "status.effort.max"
  | "status.wallet.unknown"
  // composer
  | "composer.placeholder"
  | "composer.send"
  | "composer.cancel"
  | "composer.exit"
  // prompts / hints
  | "prompt.confirm"
  | "prompt.yes"
  | "prompt.no"
  | "hint.tab.mode"
  | "hint.shifttab.effort"
  | "hint.ctrlc.cancel"
  | "hint.ctrlc.exit"
  // errors
  | "error.no_api_key"
  | "error.network"
  | "error.tool_failed"
  | "error.cancelled"
  // wallet
  | "wallet.low"
  | "wallet.unknown"
  | "wallet.balance"
  // sync
  | "sync.ok"
  | "sync.fail";

const EN: Record<I18nKey, string> = {
  "splash.title": "OpenSeek",
  "splash.subtitle": "terminal coding agent",
  "status.idle": "idle",
  "status.streaming": "streaming",
  "status.cancelled": "cancelled",
  "status.error": "error",
  "status.mode.plan": "plan",
  "status.mode.agent": "agent",
  "status.mode.yolo": "yolo",
  "status.effort.off": "off",
  "status.effort.high": "high",
  "status.effort.max": "max",
  "status.wallet.unknown": "wallet:?",
  "composer.placeholder": "type your message…",
  "composer.send": "send",
  "composer.cancel": "cancel",
  "composer.exit": "exit",
  "prompt.confirm": "confirm?",
  "prompt.yes": "yes",
  "prompt.no": "no",
  "hint.tab.mode": "Tab cycles mode",
  "hint.shifttab.effort": "Shift+Tab cycles reasoning effort",
  "hint.ctrlc.cancel": "Ctrl+C to cancel",
  "hint.ctrlc.exit": "Ctrl+C twice to exit",
  "error.no_api_key": "no API key. set OPENSEEK_API_KEY or ~/.openseek/config.toml",
  "error.network": "network error",
  "error.tool_failed": "tool failed",
  "error.cancelled": "cancelled",
  "wallet.low": "low wallet, top up at https://mikancloud.com/billing",
  "wallet.unknown": "wallet: unavailable",
  "wallet.balance": "wallet",
  "sync.ok": "settings synced",
  "sync.fail": "settings sync failed",
};

const ZH_HANS: Record<I18nKey, string> = {
  "splash.title": "OpenSeek",
  "splash.subtitle": "终端编程代理",
  "status.idle": "空闲",
  "status.streaming": "流式",
  "status.cancelled": "已取消",
  "status.error": "错误",
  "status.mode.plan": "规划",
  "status.mode.agent": "代理",
  "status.mode.yolo": "全自动",
  "status.effort.off": "关闭",
  "status.effort.high": "高",
  "status.effort.max": "最大",
  "status.wallet.unknown": "钱包:?",
  "composer.placeholder": "输入你的消息…",
  "composer.send": "发送",
  "composer.cancel": "取消",
  "composer.exit": "退出",
  "prompt.confirm": "确认？",
  "prompt.yes": "是",
  "prompt.no": "否",
  "hint.tab.mode": "Tab 切换模式",
  "hint.shifttab.effort": "Shift+Tab 切换推理强度",
  "hint.ctrlc.cancel": "按 Ctrl+C 取消",
  "hint.ctrlc.exit": "连按 Ctrl+C 两次退出",
  "error.no_api_key": "未配置 API key。请设置 OPENSEEK_API_KEY 或 ~/.openseek/config.toml",
  "error.network": "网络错误",
  "error.tool_failed": "工具执行失败",
  "error.cancelled": "已取消",
  "wallet.low": "余额过低，请到 https://mikancloud.com/billing 充值",
  "wallet.unknown": "钱包：不可用",
  "wallet.balance": "钱包",
  "sync.ok": "设置已同步",
  "sync.fail": "设置同步失败",
};

const DICTS: Record<Locale, Record<I18nKey, string>> = {
  en: EN,
  "zh-Hans": ZH_HANS,
};

export function isLocale(s: string | undefined | null): s is Locale {
  return s === "en" || s === "zh-Hans";
}

export function detectLocale(env: NodeJS.ProcessEnv = process.env): Locale {
  const explicit = env.OPENSEEK_LOCALE;
  if (isLocale(explicit)) return explicit;
  const candidates = [env.LC_ALL, env.LC_MESSAGES, env.LANG];
  for (const c of candidates) {
    if (typeof c === "string" && c.toLowerCase().startsWith("zh")) return "zh-Hans";
  }
  return "en";
}

/**
 * Resolve a key in a locale. Falls back to the key string itself when missing
 * — caller still gets a renderable label and the bug is visible at runtime.
 */
export function t(key: string, locale: Locale = "en"): string {
  const dict = DICTS[locale] ?? EN;
  const v = dict[key as I18nKey];
  if (v !== undefined) return v;
  // try english fallback before degrading
  const en = EN[key as I18nKey];
  if (en !== undefined) return en;
  return key;
}

export function listKeys(): I18nKey[] {
  return Object.keys(EN) as I18nKey[];
}

export const _internals = { EN, ZH_HANS };
