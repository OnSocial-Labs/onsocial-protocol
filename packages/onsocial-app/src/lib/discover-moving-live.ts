/** How often Moving replaces the board while the tab is open. */
export const MOVING_BOARD_POLL_MS = 20_000;

/** Tick relative clocks between board replacements. */
export const MOVING_CLOCK_TICK_MS = 30_000;

/** Pause when the tab is hidden or a fetch is already in flight. */
export function canRefreshMovingBoard(opts: {
  hidden: boolean;
  inFlight: boolean;
}): boolean {
  return !opts.hidden && !opts.inFlight;
}
