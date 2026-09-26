/**
 * The profile mark only starts the pin.
 * Once that release is the dock's song, pause lives on the dock and the mark hides.
 */
export function portfolioSongMarkVisible(opts: {
  pinnedId: string;
  sessionId: string | null;
}): boolean {
  return opts.sessionId !== opts.pinnedId;
}
