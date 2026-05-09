/** @jsxImportSource @opentui/solid */
// Render a single TranscriptMessage row.
//
// G1.4 — assistant-thinking rows render in gray + italic with a 💭 prefix
// and 2-cell left padding so they read as visually subordinate to the
// final assistant answer.
//
// Reactivity contract: the JSX uses <Switch>/<Match> rather than a
// top-level `const m = props.msg` + JS `switch` so that streaming
// text-delta updates (where `props.msg` becomes a new object with the
// same `kind` but longer `text`) propagate into the existing
// renderables instead of remounting them. Combined with <Index> in
// Transcript.tsx, this is what stops the per-token full-screen flicker
// during assistant streaming.

import { Match, Switch, type Accessor, type JSX } from "solid-js";
import { SyntaxStyle } from "@opentui/core";
import { defaultTheme } from "../theme.ts";
import { summarizeArgs, summarizeResult } from "../format-message.ts";
import type { TranscriptMessage } from "../types.ts";

// Lazy singleton — a default SyntaxStyle is fine for assistant prose; per-row
// instantiation would create a native Pointer per render which is wasteful.
let _markdownSyntaxStyle: SyntaxStyle | undefined;
function markdownSyntaxStyle(): SyntaxStyle {
  if (!_markdownSyntaxStyle) _markdownSyntaxStyle = SyntaxStyle.create();
  return _markdownSyntaxStyle;
}

export interface MessageRowProps {
  msg: TranscriptMessage;
}

type Of<K extends TranscriptMessage["kind"]> = Extract<TranscriptMessage, { kind: K }>;

// Helper: returns the message narrowed to `kind` if it matches, else null.
// `<Match when={...}>` treats null/undefined as inactive and passes the
// truthy value into the children accessor — exactly the narrowing we need.
function asKind<K extends TranscriptMessage["kind"]>(
  msg: TranscriptMessage,
  kind: K,
): Of<K> | null {
  return msg.kind === kind ? (msg as Of<K>) : null;
}

export function MessageRow(props: MessageRowProps): JSX.Element {
  return (
    <Switch>
      <Match when={asKind(props.msg, "user")}>
        {(m: Accessor<Of<"user">>) => (
          <box flexDirection="row">
            <text fg={defaultTheme.user}>{`> ${m().text}`}</text>
          </box>
        )}
      </Match>

      <Match when={asKind(props.msg, "assistant-text")}>
        {(m: Accessor<Of<"assistant-text">>) => (
          // opentui's <markdown> renders headings, code blocks, lists,
          // tables, emphasis, etc. natively in the terminal.
          // `streaming={true}` keeps the parse tolerant of mid-stream
          // token sequences (e.g. an unclosed code fence during
          // streaming) without flashing parse errors. Reading `m().text`
          // here keeps the binding reactive — opentui's
          // MarkdownRenderable.set content() applies the delta in place.
          <box flexDirection="column">
            <markdown
              content={m().text}
              streaming={true}
              fg={defaultTheme.assistant}
              syntaxStyle={markdownSyntaxStyle()}
            />
          </box>
        )}
      </Match>

      <Match when={asKind(props.msg, "assistant-thinking")}>
        {(m: Accessor<Of<"assistant-thinking">>) => (
          // G1.4: gray + italic. <i> wraps the text so opentui applies
          // the italic attribute even on terminals where setting
          // `attributes` on the parent <text> alone is finicky.
          <box flexDirection="row" paddingLeft={2}>
            <text fg={defaultTheme.thinking}>
              <i>{`💭 ${m().text}`}</i>
            </text>
          </box>
        )}
      </Match>

      <Match when={asKind(props.msg, "tool-call")}>
        {(m: Accessor<Of<"tool-call">>) => (
          <box flexDirection="row">
            <text fg={defaultTheme.tool}>{`🔧 ${m().toolName}(${summarizeArgs(m().args)})`}</text>
          </box>
        )}
      </Match>

      <Match when={asKind(props.msg, "tool-result")}>
        {(m: Accessor<Of<"tool-result">>) => (
          <box flexDirection="row">
            <text fg={m().isError ? defaultTheme.error : defaultTheme.tool}>
              {`  ↳ ${summarizeResult(m().result)}`}
            </text>
          </box>
        )}
      </Match>

      <Match when={asKind(props.msg, "error")}>
        {(m: Accessor<Of<"error">>) => (
          <box flexDirection="row">
            <text fg={defaultTheme.error}>{`× ${m().text}`}</text>
          </box>
        )}
      </Match>

      <Match when={asKind(props.msg, "cancelled")}>
        {(m: Accessor<Of<"cancelled">>) => (
          <box flexDirection="row">
            <text fg={defaultTheme.dim}>{`[cancelled]${m().text ? ` ${m().text}` : ""}`}</text>
          </box>
        )}
      </Match>

      <Match when={asKind(props.msg, "system")}>
        {(m: Accessor<Of<"system">>) => (
          <box flexDirection="row">
            <text fg={defaultTheme.system}>{m().text}</text>
          </box>
        )}
      </Match>
    </Switch>
  );
}
