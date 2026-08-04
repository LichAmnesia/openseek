// Minimal argv parser. We avoid yargs/commander to keep bundle small.

export interface ParsedArgv {
  /** One-shot prompt (-p flag). When set, run a single turn and exit. */
  prompt?: string;
  /**
   * One-shot output format (`--format`, alias `--json`). "text" (default)
   * streams human-readable output to stdout; "json" emits one NDJSON event
   * per line so headless callers (e.g. the HiveDesk daemon) can parse the
   * stream deterministically. Only affects one-shot (`-p`) runs.
   */
  format: "text" | "json";
  /** --provider override. */
  provider?: string;
  /** --model override. */
  model?: string;
  /** --version short-circuit. */
  version: boolean;
  /** --help short-circuit. */
  help: boolean;
  /**
   * Subcommand. Phase 3 adds `setup` (always-run wizard) and `model`
   * (jump straight to model picker). `serve` predates v0.6. `doctor`
   * prints the resolved config + per-field source.
   */
  subcommand?: "setup" | "model" | "serve" | "doctor";
  /** Boot the headless HTTP/SSE server when subcommand=serve. */
  serveHttp: boolean;
  /** Custom port (`--port`). */
  port?: number;
  /** Custom bind host (`--host`). */
  host?: string;
  /** Skip the first-run wizard (debug / scripted runs). */
  noSetup: boolean;
  /**
   * Max agent tool-steps for a one-shot run (`--max-steps`). One-shot runs
   * default higher than the interactive session cap (12) because a `-p`
   * task must finish in a single invocation — long workflows routinely
   * need dozens of tool calls.
   */
  maxSteps?: number;
}

export function parseArgv(argv: string[]): ParsedArgv {
  const out: ParsedArgv = { version: false, help: false, serveHttp: false, noSetup: false, format: "text" };
  let i = 0;
  const head = argv[0];
  if (head === "serve" || head === "setup" || head === "model" || head === "doctor") {
    out.subcommand = head;
    i = 1;
  }
  for (; i < argv.length; i++) {
    const a = argv[i];
    if (a === undefined) continue;
    if (a === "--version" || a === "-v") {
      out.version = true;
    } else if (a === "--help" || a === "-h") {
      out.help = true;
    } else if (a === "--http") {
      out.serveHttp = true;
    } else if (a === "--no-setup") {
      out.noSetup = true;
    } else if (a === "--port") {
      const next = argv[i + 1];
      if (next !== undefined) out.port = Number(next);
      i++;
    } else if (a === "--host") {
      out.host = argv[i + 1];
      i++;
    } else if (a === "-p" || a === "--prompt") {
      out.prompt = argv[i + 1];
      i++;
    } else if (a === "--provider") {
      out.provider = argv[i + 1];
      i++;
    } else if (a === "--model") {
      out.model = argv[i + 1];
      i++;
    } else if (a === "--max-steps") {
      const next = argv[i + 1];
      if (next !== undefined) {
        const n = Number(next);
        if (Number.isInteger(n) && n > 0) out.maxSteps = n;
      }
      i++;
    } else if (a === "--format") {
      const next = argv[i + 1];
      if (next === "json" || next === "text") out.format = next;
      i++;
    } else if (a === "--json") {
      out.format = "json";
    } else if (!a.startsWith("-") && out.prompt === undefined && out.subcommand === undefined) {
      // Trailing positional treated as one-shot prompt.
      out.prompt = a;
    }
  }
  return out;
}

export const HELP_TEXT = `OpenSeek — terminal coding agent

Usage:
  openseek                    Launch interactive TUI
  openseek "your prompt"      One-shot mode (no TUI)
  openseek -p "your prompt"   Same as above
  openseek setup              Run the onboarding wizard and save to config.toml
  openseek model              Jump to the model picker only
  openseek doctor             Print resolved config + per-field source layer
  openseek serve --http       Start HTTP/SSE API server (v0.6)

Options:
  --provider <id>    Provider override (default: deepseek)
  --model <id>       Model override (default: deepseek-v4-flash)
  --http             (with serve) bind HTTP/SSE server
  --port <n>         (with serve) listen port (default: 7117)
  --host <h>         (with serve) bind host (default: 127.0.0.1)
  -p, --prompt       One-shot prompt
  --format <fmt>     (one-shot) output format: text (default) | json (NDJSON)
  --json             (one-shot) shorthand for --format json
  --max-steps <n>    (one-shot) max agent tool-steps (default: 100)
  --no-setup         Skip the first-run onboarding wizard
  -v, --version      Print version
  -h, --help         Print this help

Slash commands (inside the TUI):
  /model             Switch the active model
  /provider          Switch provider (and re-pick model)
  /clear             Clear the transcript
  /help              Show slash-command help
  /quit (or /exit)   Exit OpenSeek

Configure (precedence: env > project > user > default):
  1. env       OPENSEEK_PROVIDER / OPENSEEK_MODEL / OPENSEEK_API_KEY / OPENSEEK_BASE_URL
  2. project   <workspace>/.openseek/config.toml  (model only — secrets ignored)
  3. user      ~/.openseek/config.toml
  4. default   built-in fallbacks
  Run 'openseek doctor' to see where each value resolved from.

Custom / self-hosted LLM (any OpenAI-compat server — llama-server, LM Studio, …):
  ~/.openseek/config.toml:
    provider = "custom"
    model    = "<model-id>"            # e.g. qwen3.6-35b-a3b
    base_url = "http://host:8080/v1"   # required for provider "custom"
    api_key  = "..."                   # optional — most local servers skip auth

Docs:
  https://github.com/LichAmnesia/openseek
`;
