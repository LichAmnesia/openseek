// @openseek/tui — vim modal editing core (G4.6).
//
// Pure-logic state machine — no opentui hooks. The Composer (or any other
// renderer) feeds key events into `applyVimKey` and gets back the next
// `VimState` plus an optional `VimAction` describing what changed (cursor
// move, line-wise delete, paste, mode switch, …). v0.6 will lift these
// actions into the live <input> renderable.

export type VimMode = "insert" | "normal";

export interface VimState {
  /** Current modal state. */
  mode: VimMode;
  /** Working buffer split by line. */
  lines: string[];
  /** Cursor row (0-based, clamped to lines length-1). */
  row: number;
  /** Cursor column (0-based, clamped to current line length). */
  col: number;
  /** Yank/delete register — last clipped text. */
  register: string;
  /** Whether the register holds a line-wise yank (paste appends a new line). */
  registerLinewise: boolean;
  /** Pending repeat count, e.g. user typed `3` before the action verb. */
  repeat: number;
  /** Pending pending-operator (d / y) waiting for a motion or doubling. */
  pending: "d" | "y" | null;
  /** Append-only history of applied actions (handy for tests + replay). */
  history: VimAction[];
}

export interface KeyEvent {
  /** Single character or named key ("Escape", "Enter", "Backspace"). */
  key: string;
  shift?: boolean;
  ctrl?: boolean;
}

export type VimAction =
  | { kind: "mode"; mode: VimMode }
  | { kind: "move"; row: number; col: number }
  | { kind: "insert-text"; text: string }
  | { kind: "delete-line"; row: number; text: string }
  | { kind: "yank-line"; row: number; text: string }
  | { kind: "paste"; row: number; linewise: boolean; text: string }
  | { kind: "delete-word"; row: number; col: number; text: string }
  | { kind: "noop"; reason: string };

export interface VimStep {
  state: VimState;
  action?: VimAction;
}

export function createVimState(initial: string[] = [""]): VimState {
  const lines = initial.length === 0 ? [""] : initial.slice();
  return {
    mode: "insert",
    lines,
    row: 0,
    col: 0,
    register: "",
    registerLinewise: false,
    repeat: 0,
    pending: null,
    history: [],
  };
}

export function applyVimKey(state: VimState, evt: KeyEvent): VimStep {
  if (evt.key === "Escape") {
    const next = patch(state, { mode: "normal", pending: null, repeat: 0 });
    return record(next, { kind: "mode", mode: "normal" });
  }

  if (state.mode === "insert") {
    return applyInsertKey(state, evt);
  }
  return applyNormalKey(state, evt);
}

function applyInsertKey(state: VimState, evt: KeyEvent): VimStep {
  if (evt.key.length === 1 && !evt.ctrl) {
    const line = state.lines[state.row] ?? "";
    const nextLine = line.slice(0, state.col) + evt.key + line.slice(state.col);
    const lines = state.lines.slice();
    lines[state.row] = nextLine;
    const next = patch(state, { lines, col: state.col + 1 });
    return record(next, { kind: "insert-text", text: evt.key });
  }
  return { state, action: { kind: "noop", reason: `insert:${evt.key}` } };
}

function applyNormalKey(state: VimState, evt: KeyEvent): VimStep {
  const k = evt.key;

  if (k.length === 1 && k >= "0" && k <= "9" && !(k === "0" && state.repeat === 0)) {
    const repeat = state.repeat * 10 + Number(k);
    return { state: patch(state, { repeat }) };
  }

  if (k === "i") {
    const next = patch(state, { mode: "insert", pending: null, repeat: 0 });
    return record(next, { kind: "mode", mode: "insert" });
  }

  if (k === "h" || k === "j" || k === "k" || k === "l") {
    const reps = Math.max(1, state.repeat);
    const moved = move(state, k, reps);
    const next = patch(moved, { repeat: 0 });
    return record(next, { kind: "move", row: next.row, col: next.col });
  }

  if (k === "d" || k === "y") {
    if (state.pending === k) {
      return k === "d" ? deleteLine(state) : yankLine(state);
    }
    return { state: patch(state, { pending: k }) };
  }

  if (k === "w" && state.pending === "d") {
    return deleteWord(state);
  }

  if (k === "p") {
    return paste(state);
  }

  return { state: patch(state, { repeat: 0, pending: null }), action: { kind: "noop", reason: `normal:${k}` } };
}

function move(state: VimState, key: "h" | "j" | "k" | "l", reps: number): VimState {
  let { row, col } = state;
  for (let i = 0; i < reps; i++) {
    if (key === "h") col = Math.max(0, col - 1);
    if (key === "l") col = Math.min((state.lines[row] ?? "").length, col + 1);
    if (key === "k") row = Math.max(0, row - 1);
    if (key === "j") row = Math.min(state.lines.length - 1, row + 1);
  }
  col = Math.min(col, (state.lines[row] ?? "").length);
  return patch(state, { row, col });
}

function deleteLine(state: VimState): VimStep {
  const text = state.lines[state.row] ?? "";
  const lines = state.lines.slice();
  lines.splice(state.row, 1);
  if (lines.length === 0) lines.push("");
  const row = Math.min(state.row, lines.length - 1);
  const next = patch(state, {
    lines,
    row,
    col: 0,
    register: text,
    registerLinewise: true,
    pending: null,
    repeat: 0,
  });
  return record(next, { kind: "delete-line", row: state.row, text });
}

function yankLine(state: VimState): VimStep {
  const text = state.lines[state.row] ?? "";
  const next = patch(state, {
    register: text,
    registerLinewise: true,
    pending: null,
    repeat: 0,
  });
  return record(next, { kind: "yank-line", row: state.row, text });
}

function paste(state: VimState): VimStep {
  if (state.register.length === 0) {
    return { state: patch(state, { repeat: 0 }), action: { kind: "noop", reason: "paste:empty" } };
  }
  const lines = state.lines.slice();
  if (state.registerLinewise) {
    lines.splice(state.row + 1, 0, state.register);
    const next = patch(state, { lines, row: state.row + 1, col: 0, repeat: 0 });
    return record(next, { kind: "paste", row: state.row, linewise: true, text: state.register });
  }
  const line = lines[state.row] ?? "";
  lines[state.row] = line.slice(0, state.col + 1) + state.register + line.slice(state.col + 1);
  const next = patch(state, {
    lines,
    col: state.col + state.register.length,
    repeat: 0,
  });
  return record(next, {
    kind: "paste",
    row: state.row,
    linewise: false,
    text: state.register,
  });
}

function deleteWord(state: VimState): VimStep {
  const line = state.lines[state.row] ?? "";
  const rest = line.slice(state.col);
  const m = rest.match(/^(\s*\S+\s*)/);
  const cut = m?.[0] ?? rest;
  if (cut.length === 0) {
    return {
      state: patch(state, { pending: null, repeat: 0 }),
      action: { kind: "noop", reason: "dw:empty" },
    };
  }
  const lines = state.lines.slice();
  lines[state.row] = line.slice(0, state.col) + line.slice(state.col + cut.length);
  const next = patch(state, {
    lines,
    register: cut,
    registerLinewise: false,
    pending: null,
    repeat: 0,
  });
  return record(next, { kind: "delete-word", row: state.row, col: state.col, text: cut });
}

function patch(state: VimState, over: Partial<VimState>): VimState {
  return { ...state, ...over };
}

function record(state: VimState, action: VimAction): VimStep {
  return { state: { ...state, history: [...state.history, action] }, action };
}
