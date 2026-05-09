// Non-blocking boot side effects for the interactive TUI.
//
// Wallet and settings sync are useful status enrichments, not prerequisites
// for typing into the composer. Keep them outside the critical render path so
// a slow gateway cannot make startup feel frozen.

import type { WalletInfo } from "@openseek/provider";
import type { TranscriptMessage } from "@openseek/tui";
import {
  bootInteractive,
  type BootMessageRow,
  type BootOpts,
  type BootResult,
} from "./boot.ts";

export interface BootSideEffectOpts {
  bootOpts: BootOpts;
  boot?: (opts: BootOpts) => Promise<BootResult>;
  isDisposed?: () => boolean;
  setWalletBalance: (wallet: WalletInfo | null) => void;
  appendMessages: (rows: TranscriptMessage[]) => void;
}

export async function runBootSideEffects(opts: BootSideEffectOpts): Promise<void> {
  try {
    const boot = opts.boot ?? bootInteractive;
    const result = await boot(opts.bootOpts);
    if (opts.isDisposed?.()) return;
    opts.setWalletBalance(result.wallet);
    if (result.messages.length > 0) {
      opts.appendMessages(result.messages.map(toTranscriptRow));
    }
  } catch {
    // Best-effort startup enrichment only. Composer interactivity must not
    // depend on this path succeeding.
  }
}

function toTranscriptRow(row: BootMessageRow): TranscriptMessage {
  return { ...row };
}
