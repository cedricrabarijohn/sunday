/** Cookie that remembers the board a user last opened, for the `/` redirect. */
export const LAST_BOARD_COOKIE = "sunday_last_board";

/** 30 days — long enough to be useful, short enough to expire if abandoned. */
export const LAST_BOARD_MAX_AGE = 60 * 60 * 24 * 30;

/**
 * Remember the current board client-side. It's a UX hint, not a secret, so a
 * plain (non-httpOnly) cookie the browser can set directly is fine — no API
 * round-trip needed.
 */
export function rememberLastBoard(boardId: number): void {
  if (typeof document === "undefined" || !(boardId > 0)) return;
  document.cookie =
    `${LAST_BOARD_COOKIE}=${boardId}; path=/; max-age=${LAST_BOARD_MAX_AGE}; samesite=lax`;
}
