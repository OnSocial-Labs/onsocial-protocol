/** Same release already in the dock toggles. Anything else replaces it. */
export function portfolioHeroPlayAction(opts: {
  pinnedId: string;
  sessionId: string | null;
  playing: boolean;
}): 'toggle' | 'switch' {
  if (opts.sessionId === opts.pinnedId) return 'toggle';
  return 'switch';
}
