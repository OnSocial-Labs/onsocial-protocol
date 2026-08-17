import { describe, expect, it } from 'vitest';
import {
  APP_LEADERBOARD_PATH,
  leaderboardPath,
  parseLeaderboardTrackParam,
} from '@/lib/app-routes';

describe('leaderboardPath', () => {
  it('defaults to bare /leaderboard for reputation', () => {
    expect(leaderboardPath()).toBe(APP_LEADERBOARD_PATH);
    expect(leaderboardPath({ track: 'reputation' })).toBe(APP_LEADERBOARD_PATH);
  });

  it('deep-links influence and earners', () => {
    expect(leaderboardPath({ track: 'influence' })).toBe(
      `${APP_LEADERBOARD_PATH}?track=influence`
    );
    expect(leaderboardPath({ track: 'earners' })).toBe(
      `${APP_LEADERBOARD_PATH}?track=earners`
    );
  });
});

describe('parseLeaderboardTrackParam', () => {
  it('parses known tracks and defaults to reputation', () => {
    expect(parseLeaderboardTrackParam('influence')).toBe('influence');
    expect(parseLeaderboardTrackParam('Earners')).toBe('earners');
    expect(parseLeaderboardTrackParam(null)).toBe('reputation');
    expect(parseLeaderboardTrackParam('nope')).toBe('reputation');
  });
});
