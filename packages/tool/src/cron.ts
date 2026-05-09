// Minimal cron expression parser for G3.8 scheduling.
//
// Supports a deliberately small subset of the standard cron grammar — enough
// for the v0.3 scheduler façade to validate user input and compute the next
// fire time. The actual cron daemon belongs to the v0.6 server.
//
// Supported forms:
//   "*/N * * * *"   every N minutes (1 ≤ N ≤ 59)
//   "M * * * *"     every hour at minute M (0 ≤ M ≤ 59)
//   "M H * * *"     daily at HH:MM (M 0-59, H 0-23)
//   "@hourly"       == "0 * * * *"
//   "@daily"        == "0 0 * * *"
//   "@weekly"       == "0 0 * * 0"
//
// Anything else throws — the tool layer turns the throw into a ToolResult
// error.

export interface ParsedCron {
  /** Canonical 5-field representation, useful for debug + storage. */
  canonical: string;
  /** Compute the next firing time strictly after `from` (ms since epoch). */
  nextRun(from: number): number;
}

const HOURLY = "0 * * * *";
const DAILY = "0 0 * * *";
const WEEKLY = "0 0 * * 0";

export function parseCron(expr: string): ParsedCron {
  const trimmed = expr.trim();
  if (trimmed.length === 0) throw new Error("empty cron expression");

  if (trimmed === "@hourly") return parseStrict(HOURLY);
  if (trimmed === "@daily" || trimmed === "@midnight") return parseStrict(DAILY);
  if (trimmed === "@weekly") return parseStrict(WEEKLY);

  return parseStrict(trimmed);
}

function parseStrict(canonical: string): ParsedCron {
  const parts = canonical.split(/\s+/);
  if (parts.length !== 5) {
    throw new Error(`cron must have 5 fields, got ${parts.length}: '${canonical}'`);
  }
  const [minute, hour, dom, month, dow] = parts as [string, string, string, string, string];

  // Day-of-month / month must always be "*" (subset grammar).
  if (dom !== "*") {
    throw new Error(`unsupported cron field (only '*' allowed for day-of-month): '${canonical}'`);
  }
  if (month !== "*") {
    throw new Error(`unsupported cron field (only '*' allowed for month): '${canonical}'`);
  }
  // dow must be "*" except for the @weekly alias where it's "0".
  const isWeekly = canonical === WEEKLY;
  if (dow !== "*" && !isWeekly) {
    throw new Error(`unsupported cron field (only '*' allowed for day-of-week): '${canonical}'`);
  }

  // Form A: "*/N * * * *" → every N minutes
  const everyMatch = /^\*\/(\d+)$/.exec(minute);
  if (everyMatch) {
    if (hour !== "*") {
      throw new Error(`'*/N' minute requires hour='*': '${canonical}'`);
    }
    const stepStr = everyMatch[1];
    if (!stepStr) throw new Error(`invalid step in cron: '${canonical}'`);
    const step = Number.parseInt(stepStr, 10);
    if (!Number.isFinite(step) || step < 1 || step > 59) {
      throw new Error(`step out of range (1-59): '${canonical}'`);
    }
    return {
      canonical,
      nextRun(from) {
        const next = new Date(from);
        next.setUTCSeconds(0, 0);
        next.setUTCMilliseconds(0);
        next.setUTCMinutes(next.getUTCMinutes() + 1);
        while (next.getUTCMinutes() % step !== 0) {
          next.setUTCMinutes(next.getUTCMinutes() + 1);
        }
        return next.getTime();
      },
    };
  }

  // Form B: "M * * * *" → every hour at minute M
  const m = parseFixed(minute, 0, 59, "minute");
  if (hour === "*") {
    return {
      canonical,
      nextRun(from) {
        const next = new Date(from);
        next.setUTCSeconds(0, 0);
        next.setUTCMilliseconds(0);
        next.setUTCMinutes(next.getUTCMinutes() + 1);
        while (next.getUTCMinutes() !== m) {
          next.setUTCMinutes(next.getUTCMinutes() + 1);
        }
        return next.getTime();
      },
    };
  }

  // Form C: "M H * * *" (daily) or @weekly variant
  const h = parseFixed(hour, 0, 23, "hour");
  if (isWeekly) {
    return {
      canonical,
      nextRun(from) {
        const next = new Date(from);
        next.setUTCSeconds(0, 0);
        next.setUTCMilliseconds(0);
        next.setUTCMinutes(next.getUTCMinutes() + 1);
        for (let i = 0; i < 7 * 24 * 60 + 10; i += 1) {
          if (
            next.getUTCDay() === 0 &&
            next.getUTCHours() === h &&
            next.getUTCMinutes() === m
          ) {
            return next.getTime();
          }
          next.setUTCMinutes(next.getUTCMinutes() + 1);
        }
        throw new Error("weekly nextRun search exhausted");
      },
    };
  }
  return {
    canonical,
    nextRun(from) {
      const next = new Date(from);
      next.setUTCSeconds(0, 0);
      next.setUTCMilliseconds(0);
      next.setUTCMinutes(next.getUTCMinutes() + 1);
      while (!(next.getUTCHours() === h && next.getUTCMinutes() === m)) {
        next.setUTCMinutes(next.getUTCMinutes() + 1);
      }
      return next.getTime();
    },
  };
}

function parseFixed(field: string, min: number, max: number, label: string): number {
  if (!/^\d+$/.test(field)) {
    throw new Error(`unsupported ${label} expression: '${field}'`);
  }
  const value = Number.parseInt(field, 10);
  if (!Number.isFinite(value) || value < min || value > max) {
    throw new Error(`${label} out of range (${min}-${max}): '${field}'`);
  }
  return value;
}
