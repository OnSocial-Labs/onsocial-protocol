import { describe, expect, it } from 'vitest';
import {
  appendLeaderboardPage,
  commitmentLabel,
  entriesForTrack,
  formatReputationComponent,
  formatReputationScore,
  leaderboardHasMorePage,
  leaderboardHeaderYouLine,
  leaderboardTrackFromPager,
  leaderboardTrackIndex,
  leaderboardTrackSubtitle,
  leaderboardViewerLine,
  pctOfLeader,
  reputationConfidenceLabel,
  reputationEntryToProfile,
  reputationTierLabel,
} from '@/lib/leaderboard';

describe('leaderboard helpers', () => {
  it('formats reputation scores', () => {
    expect(formatReputationScore(0)).toBe('0');
    expect(formatReputationScore(12.4)).toBe('12.4');
    expect(formatReputationScore(120)).toBe('120');
    expect(formatReputationScore(12500)).toBe('12.5K');
  });

  it('formats component scores', () => {
    expect(formatReputationComponent(8.2)).toBe('8.2');
    expect(formatReputationComponent(100)).toBe('100');
  });

  it('maps commitment, tier, and confidence labels', () => {
    expect(commitmentLabel(48)).toBe('Citadel');
    expect(commitmentLabel(3)).toBe('Scout');
    expect(reputationTierLabel(1)).toBe('Legend');
    expect(reputationTierLabel(12)).toBe('Active');
    expect(reputationConfidenceLabel(0.2).label).toBe('Limited data');
    expect(reputationConfidenceLabel(0.8).label).toBe('Established');
  });

  it('computes percent of leader', () => {
    expect(pctOfLeader(50, 100)).toBe(50);
    expect(pctOfLeader(0, 100)).toBe(0);
    expect(pctOfLeader(10, 0)).toBe(0);
  });

  it('picks entries for each track', () => {
    expect(
      entriesForTrack('influence', {
        leaderboardBoost: [
          {
            accountId: 'a',
            lockedAmount: '0',
            effectiveBoost: '1',
            lockMonths: 1,
            rank: 1,
          },
        ],
      })
    ).toHaveLength(1);
    expect(entriesForTrack('reputation', { reputationScores: [] })).toEqual([]);
    expect(entriesForTrack('earners', null)).toBeNull();
  });

  it('appends leaderboard pages without duplicate accounts', () => {
    const row = (accountId: string, rank: number) => ({
      accountId,
      standingWith: 0,
      mutualStanding: 0,
      endorsementsReceived: 0,
      boost: '1',
      lockMonths: 0,
      totalPosts: 0,
      activeDays: 0,
      reactionsReceived: 0,
      scarcesCreated: 0,
      socialScore: '0',
      commitmentScore: '0',
      qualityScore: '0',
      consistencyScore: '0',
      scarcesScore: '0',
      reputation: String(10 - rank),
      confidenceScore: '0.5',
      rank,
    });
    const first = appendLeaderboardPage(
      'reputation',
      null,
      { reputationScores: [row('a.near', 1)] },
      1
    );
    expect(first.hasMore).toBe(true);
    const second = appendLeaderboardPage(
      'reputation',
      first.board,
      { reputationScores: [row('a.near', 1), row('b.near', 2)] },
      2
    );
    expect(second.board.reputationScores).toHaveLength(2);
    expect(
      reputationEntryToProfile(second.board.reputationScores![1]!).rank
    ).toBe(2);
  });

  it('re-exports metric subtitle and you-line', () => {
    expect(leaderboardTrackSubtitle('reputation')).toBe(
      'All-time weighted score'
    );
    expect(leaderboardViewerLine({ rank: 47, primary: '12.4' })).toBe(
      "You're #47 · 12.4"
    );
  });

  it('stops the board at the top window', () => {
    expect(
      leaderboardHasMorePage({ incomingCount: 20, pageSize: 20, offset: 180 })
    ).toBe(true);
    expect(
      leaderboardHasMorePage({ incomingCount: 20, pageSize: 20, offset: 200 })
    ).toBe(false);
    expect(
      leaderboardHasMorePage({ incomingCount: 4, pageSize: 20, offset: 0 })
    ).toBe(false);
  });

  it('maps a horizontal pager offset onto the three boards', () => {
    expect(leaderboardTrackIndex('reputation')).toBe(0);
    expect(leaderboardTrackIndex('influence')).toBe(1);
    expect(leaderboardTrackIndex('earners')).toBe(2);
    expect(leaderboardTrackFromPager(0, 390)).toBe('reputation');
    expect(leaderboardTrackFromPager(180, 390)).toBe('reputation');
    expect(leaderboardTrackFromPager(200, 390)).toBe('influence');
    expect(leaderboardTrackFromPager(390, 390)).toBe('influence');
    expect(leaderboardTrackFromPager(780, 390)).toBe('earners');
    expect(leaderboardTrackFromPager(2000, 390)).toBe('earners');
    expect(leaderboardTrackFromPager(0, 0)).toBe('reputation');
  });

  it('shows your rank in the header only when the pin is hidden', () => {
    expect(leaderboardHeaderYouLine({ rank: 12, pinVisible: false })).toBe(
      "You're #12"
    );
    expect(leaderboardHeaderYouLine({ rank: 12, pinVisible: true })).toBeNull();
    expect(
      leaderboardHeaderYouLine({ rank: null, pinVisible: false })
    ).toBeNull();
  });
});
