/** @jsxImportSource @opentui/solid */
// Scrollable transcript: stacks MessageRow vertically inside a ScrollBox.
//
// `stickyScroll` + `stickyStart="bottom"` keeps the view pinned to the latest
// message as new rows stream in, but releases as soon as the user scrolls up
// — so reviewing earlier output doesn't fight live deltas.
//
// `props.scrollRef` lets the parent (App) hold the underlying renderable so
// it can drive scroll from its own keyboard handler (pageup/pagedown bubble
// past the focused composer Input — they aren't in the textarea key bindings,
// so the input's handleKeyPress returns false and the renderer-level
// useKeyboard listener still fires).

import { Index, type JSX, type Accessor } from "solid-js";
import type { ScrollBoxRenderable } from "@opentui/core";
import { MessageRow } from "./MessageRow.tsx";
import type { TranscriptMessage } from "../types.ts";

export interface TranscriptProps {
  messages: Accessor<TranscriptMessage[]>;
  /** Receives the ScrollBox renderable so the parent can scrollBy. */
  scrollRef?: (el: ScrollBoxRenderable) => void;
}

export function Transcript(props: TranscriptProps): JSX.Element {
  return (
    <scrollbox
      ref={(el: ScrollBoxRenderable) => props.scrollRef?.(el)}
      flexGrow={1}
      flexShrink={1}
      // minHeight:0 — without this, Yoga uses content's intrinsic height as
      // a min, which lets a very tall markdown render push the parent column
      // past the window height and squeeze the Composer to zero.
      minHeight={0}
      stickyScroll={true}
      stickyStart="bottom"
      scrollY={true}
      paddingX={1}
      paddingY={0}
    >
      {/*
        <Index> not <For>: <For> keys by reference identity, so when a
        streaming text-delta replaces the last message with a new object
        reference (mergeAssistant in @openseek/cli), <For> tears down the
        old MessageRow and re-creates the <markdown> renderable on every
        token — visible as a full-screen flicker. <Index> keys by
        position, so the same renderable instance survives and opentui's
        MarkdownRenderable applies the incremental `content` setter.
      */}
      <Index each={props.messages()}>{(m) => <MessageRow msg={m()} />}</Index>
    </scrollbox>
  );
}
