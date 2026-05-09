// Slash-command parser for the composer (Phase 3).
//
// Pure: parseSlashCommand returns a discriminated union or null when the
// input is not a slash command. The parent dispatches the command — this
// module knows nothing about the runtime / TUI / persistence layers.
//
// Rules:
//   * Input must START with "/" (no leading whitespace allowed).
//   * Trailing whitespace is trimmed before matching.
//   * Match is case-insensitive ("/MODEL" works).
//   * "/exit" is an alias for "/quit".
//   * "/" alone or "/<unknown>" returns { type: "unknown", command: "..." }.
//   * Anything else (free text) returns null so the LLM submit path runs.

export type SlashCommand =
  | { type: "model"; args: string[] }
  | { type: "provider"; args: string[] }
  | { type: "help"; args: string[] }
  | { type: "quit"; args: string[] }
  | { type: "clear"; args: string[] }
  | { type: "command"; name: string; args: string[] }
  | { type: "unknown"; command: string; args: string[] };

export interface SlashCommandSpec {
  name: string;
  description: string;
}

export interface SlashCompletionState {
  active: boolean;
  prefix: string;
  candidates: ReadonlyArray<SlashCommandSpec>;
}

export interface SlashCompletionSession {
  prefix: string;
  names: readonly string[];
  index: number;
  value: string;
}

export interface SlashCompletionResult {
  value: string;
  session: SlashCompletionSession;
}

export const SLASH_COMMANDS: ReadonlyArray<SlashCommandSpec> = [
  { name: "/model", description: "Switch the active model" },
  { name: "/provider", description: "Switch provider (and re-pick model)" },
  { name: "/clear", description: "Clear the transcript" },
  { name: "/help", description: "Show this help" },
  { name: "/quit", description: "Exit OpenSeek" },
] as const;

/**
 * Parse user input as a slash command. Returns null when the input is not
 * a slash command (i.e. should be sent to the LLM).
 */
export function parseSlashCommand(
  input: string,
  commands: ReadonlyArray<SlashCommandSpec> = SLASH_COMMANDS,
): SlashCommand | null {
  if (input.length === 0) return null;
  // No leading whitespace allowed — "/" must be at index 0.
  if (input[0] !== "/") return null;

  // Drop the leading slash, trim trailing whitespace, lowercase for the match.
  const body = input.slice(1).trimEnd();

  const parts = body.length === 0 ? [] : body.split(/\s+/);
  const firstWord = parts[0] ?? "";
  const args = parts.slice(1);
  const cmd = firstWord.toLowerCase();
  const knownCommands = new Set(normalizeSlashCommandSpecs(commands).map((c) => c.name.slice(1)));

  switch (cmd) {
    case "model":
      return { type: "model", args };
    case "provider":
      return { type: "provider", args };
    case "help":
      return { type: "help", args };
    case "quit":
    case "exit":
      return { type: "quit", args };
    case "clear":
      return { type: "clear", args };
    default:
      if (knownCommands.has(cmd)) return { type: "command", name: cmd, args };
      return { type: "unknown", command: firstWord, args };
  }
}

export function getSlashCompletions(
  input: string,
  commands: ReadonlyArray<SlashCommandSpec> = SLASH_COMMANDS,
): SlashCompletionState {
  if (input.length === 0 || input[0] !== "/") {
    return { active: false, prefix: "", candidates: [] };
  }

  const body = input.slice(1);
  if (/\s/.test(body)) {
    return { active: false, prefix: "", candidates: [] };
  }

  const prefix = `/${body.toLowerCase()}`;
  const query = body.toLowerCase();
  const scored = normalizeSlashCommandSpecs(commands)
    .map((cmd, index) => ({ cmd, index, score: slashCommandScore(cmd, query) }))
    .filter(
      (entry): entry is { cmd: SlashCommandSpec; index: number; score: number } =>
        entry.score !== null,
    );
  const hasNameMatch = scored.some((entry) => entry.score < 100);
  const candidates = scored
    .filter((entry) => !hasNameMatch || entry.score < 100)
    .sort((a, b) => a.score - b.score || a.index - b.index)
    .map((entry) => entry.cmd);
  return { active: true, prefix, candidates };
}

export function nextSlashCompletion(
  input: string,
  previous?: SlashCompletionSession,
  direction: 1 | -1 = 1,
  commands: ReadonlyArray<SlashCommandSpec> = SLASH_COMMANDS,
): SlashCompletionResult | null {
  const activeSession = previous?.value === input ? previous : null;
  const state = activeSession ? null : getSlashCompletions(input, commands);
  const names = activeSession
    ? activeSession.names
    : (state?.candidates.map((cmd) => cmd.name) ?? []);
  if (names.length === 0) return null;

  const baseIndex = activeSession?.index ?? (direction === 1 ? -1 : 0);
  const index = wrapIndex(baseIndex + direction, names.length);
  const value = names[index];
  if (!value) return null;

  return {
    value,
    session: {
      prefix: activeSession?.prefix ?? state?.prefix ?? input.toLowerCase(),
      names,
      index,
      value,
    },
  };
}

function wrapIndex(index: number, length: number): number {
  return ((index % length) + length) % length;
}

function slashCommandScore(cmd: SlashCommandSpec, query: string): number | null {
  if (query.length === 0) return 0;
  const name = cmd.name.toLowerCase();
  const bareName = name.startsWith("/") ? name.slice(1) : name;
  const desc = cmd.description.toLowerCase();
  if (bareName === query) return 0;
  if (bareName.startsWith(query)) return 10 + bareName.length - query.length;
  const nameFuzzy = fuzzyScore(bareName, query);
  if (nameFuzzy !== null) return 50 + nameFuzzy;
  if (query.length >= 3 && desc.includes(query)) return 100 + desc.indexOf(query);
  return null;
}

function fuzzyScore(candidate: string, query: string): number | null {
  let cursor = 0;
  let score = 0;
  let last = -1;
  for (const ch of query) {
    const idx = candidate.indexOf(ch, cursor);
    if (idx < 0) return null;
    score += last < 0 ? idx : idx - last - 1;
    last = idx;
    cursor = idx + 1;
  }
  return score;
}

export function normalizeSlashCommandSpecs(
  commands: ReadonlyArray<SlashCommandSpec>,
): ReadonlyArray<SlashCommandSpec> {
  const out: SlashCommandSpec[] = [];
  const seen = new Set<string>();
  for (const cmd of commands) {
    const name = cmd.name.startsWith("/") ? cmd.name : `/${cmd.name}`;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ name, description: cmd.description });
  }
  return out;
}
