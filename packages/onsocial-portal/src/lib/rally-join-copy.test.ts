import { describe, expect, it } from 'vitest';
import {
  RALLY_JOIN_SPLIT_EYEBROW,
  RALLY_JOIN_STANDING_HINT,
  resolveRallyJoinStandingHint,
  showRallyJoinPreActionFooter,
} from '@/lib/rally-join-copy';

describe('rally-join-copy', () => {
  it('uses neutral plural copy for the entry split eyebrow', () => {
    expect(RALLY_JOIN_SPLIT_EYEBROW).toBe('Entries split to');
    expect(RALLY_JOIN_SPLIT_EYEBROW).not.toMatch(/your entry/i);
  });

  it('frames standing growth, not payout math', () => {
    expect(RALLY_JOIN_STANDING_HINT).toMatch(/profile/i);
    expect(RALLY_JOIN_STANDING_HINT).toMatch(/endorse/i);
    expect(RALLY_JOIN_STANDING_HINT).not.toMatch(/collect/i);
    expect(RALLY_JOIN_STANDING_HINT).not.toMatch(/compete/i);
  });

  it('shows the same pre-action footer for live and upcoming rallies', () => {
    expect(
      showRallyJoinPreActionFooter({
        joined: false,
        seasonIsUpcoming: true,
      })
    ).toBe(true);
    expect(
      resolveRallyJoinStandingHint({
        joined: false,
        seasonIsUpcoming: true,
      })
    ).toBe(RALLY_JOIN_STANDING_HINT);
    expect(
      resolveRallyJoinStandingHint({
        joined: false,
        seasonIsLive: true,
      })
    ).toBe(RALLY_JOIN_STANDING_HINT);
    expect(
      showRallyJoinPreActionFooter({
        joined: true,
        seasonIsLive: true,
      })
    ).toBe(false);
  });
});
