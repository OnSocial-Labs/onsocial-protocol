/** Pre-join footer — what to do after entering, not payout math. */
export const RALLY_JOIN_STANDING_HINT =
  'Grow standing · profile · endorse · stand · boost';

/** Split eyebrow above pool / boost / burn percentages. */
export const RALLY_JOIN_SPLIT_EYEBROW = 'Entries split to';

export function resolveRallyJoinStandingHint(input: {
  joined?: boolean;
  seasonIsLive?: boolean;
  seasonIsUpcoming?: boolean;
}): string | null {
  if (input.joined) return null;
  if (input.seasonIsLive || input.seasonIsUpcoming) {
    return RALLY_JOIN_STANDING_HINT;
  }
  return null;
}

export function showRallyJoinPreActionFooter(input: {
  joined?: boolean;
  seasonIsLive?: boolean;
  seasonIsUpcoming?: boolean;
}): boolean {
  return (
    !input.joined && Boolean(input.seasonIsLive || input.seasonIsUpcoming)
  );
}
