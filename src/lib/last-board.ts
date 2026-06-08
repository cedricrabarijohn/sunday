/**
 * Remember the board a user last opened so `/` can jump back to it. Persisted
 * on the user row (cross-device) via a tiny endpoint. Fire-and-forget — it's a
 * UX hint, so a failed write just means `/` falls back to /workspaces.
 *
 * Called from a client effect (real navigation only, never on prefetch), so a
 * prefetched-but-unvisited board never gets recorded.
 */
export function rememberLastBoard(boardId: number): void {
  if (typeof window === "undefined" || !(boardId > 0)) return;
  fetch("/api/me/last-board", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ boardId }),
    keepalive: true,
  }).catch(() => {
    // Best-effort; nothing to do if it fails.
  });
}
