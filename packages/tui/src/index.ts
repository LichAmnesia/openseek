// @openseek/tui — Terminal UI rendering with @opentui/solid (G1.2 + G1.4).

export const PACKAGE_NAME = "@openseek/tui";

export { mountTui, type MountHandle } from "./mount.tsx";
export { Wizard, type WizardProps } from "./components/Wizard.tsx";
export { runWizard, type RunWizardOpts } from "./components/wizard-mount.tsx";
export {
  advanceStep,
  backStep,
  initialWizardState,
  isApiKeyRequired,
  toResult,
  type WizardProviderInfo,
  type WizardResult,
  type WizardState,
  type WizardStep,
} from "./components/wizard-logic.ts";
export { App, type AppProps } from "./App.tsx";
export {
  parseSlashCommand,
  SLASH_COMMANDS,
  type SlashCommand,
  type SlashCommandSpec,
} from "./slash-command.ts";
export { formatSourceTag } from "./format-source.ts";
export { Splash, type SplashProps } from "./components/Splash.tsx";
export { Transcript, type TranscriptProps } from "./components/Transcript.tsx";
export { Composer, type ComposerProps } from "./components/Composer.tsx";
export { MessageRow, type MessageRowProps } from "./components/MessageRow.tsx";

export {
  defaultTheme,
  themeKeys,
  THEMES,
  THEME_NAMES,
  currentTheme,
  currentThemeName,
  setCurrentTheme,
  type ThemeName,
} from "./theme.ts";
export {
  toTranscriptMessages,
  summarizeArgs,
  summarizeResult,
  type FormatOptions,
} from "./format-message.ts";
export { formatTokens } from "./format-tokens.ts";
export { formatUsage } from "./App.tsx";
export { validateSubmit, type SubmitDecision } from "./composer-logic.ts";
export {
  createDoubleCtrlCDetector,
  type CtrlCAction,
  type CtrlCDetector,
  type DetectorOptions,
} from "./double-ctrl-c.ts";

export {
  BUILTIN_OUTPUT_STYLES,
  OUTPUT_STYLE_IDS,
  applyOutputStyle,
  getOutputStyleSpec,
  isOutputStyle,
  type OutputStyle,
  type OutputStyleSpec,
} from "./output-styles.ts";

export {
  applyVimKey,
  createVimState,
  type KeyEvent,
  type VimAction,
  type VimMode,
  type VimState,
  type VimStep,
} from "./vim.ts";

export {
  isUser,
  isAssistantText,
  isAssistantThinking,
  isToolCall,
  isToolResult,
  isError,
  isCancelled,
  type ReasoningEffort,
  type TranscriptMessage,
  type TranscriptKind,
  type TuiTheme,
  type TuiStatus,
  type TuiState,
  type TuiActions,
  type TuiContext,
  type MountOptions,
  type UsageDisplay,
  type ToolApprovalState,
} from "./types.ts";

// v0.6 G6.6 — i18n
export {
  detectLocale,
  isLocale,
  listKeys,
  LOCALES,
  t,
  type I18nKey,
  type Locale,
} from "./i18n.ts";
