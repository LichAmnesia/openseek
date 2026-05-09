// DEPRECATED: in-memory stub state replaced by `sqlite-store.ts` (G3.6).
//
// This file used to expose Maps for `task_*` / `team_*` / `schedule_cron`
// stub tools. v0.3 G3.6 swapped those over to a Bun-sqlite-backed durable
// store (see `./sqlite-store.ts`). The Maps are kept here ONLY as a no-op
// reset hook for any leftover importer; nothing in the active tool path
// reads from them anymore. Delete in v0.4.

export type TaskStatus = "queued" | "running" | "stopped" | "done" | "error";

/** No-op kept for back-compat with older tests. Use sqlite-store directly. */
export function _resetStubState(): void {
  // intentionally empty — sqlite store is the source of truth
}
