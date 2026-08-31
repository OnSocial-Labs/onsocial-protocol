import { describe, expect, it } from 'vitest';
import {
  commitmentLabel,
  computeLeaderboardRankPresentation,
  filterLeaderboardEarnerRows,
  findViewerEntry,
  formatReputationComponent,
  formatReputationScore,
  isLeaderboardEarnerRanked,
  LEADERBOARD_TRACKS,
  leaderboardPrimaryUnit,
  leaderboardRankLabel,
  leaderboardShareCopy,
  leaderboardTrackHint,
  leaderboardTrackSubtitle,
  leaderboardViewerLine,
  pctOfLeader,
  influenceBoardMeta,
  reputationBoardMeta,
  reputationConfidenceLabel,
  reputationTierLabel,
} from './leaderboard.js';

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

  it('formats influence meta as lock months', () => {
    expect(influenceBoardMeta({ lockMonths: 0 })).toBe('');
    expect(influenceBoardMeta({ lockMonths: 1 })).toBe('1 mo lock');
    expect(influenceBoardMeta({ lockMonths: 12 })).toBe('12 mo lock');
    expect(influenceBoardMeta({ lockMonths: 48 })).toBe('48 mo lock');
  });

  it('keeps reputation meta on standing only', () => {
    expect(
      reputationBoardMeta({
        standingWith: 12,
        totalPosts: 40,
        activeDays: 30,
        rank: 4,
      })
    ).toBe('12 standing');
    expect(
      reputationBoardMeta({
        standingWith: 0,
        totalPosts: 3,
        activeDays: 10,
        rank: 40,
      })
    ).toBe('');
    expect(
      reputationBoardMeta({
        standingWith: 0,
        totalPosts: 0,
        activeDays: 0,
        rank: 40,
      })
    ).toBe('');
  });

  it('names the metric in the subtitle, not the tab', () => {
    expect(LEADERBOARD_TRACKS.map((t) => t.id)).toEqual([
      'reputation',
      'influence',
      'earners',
    ]);
    expect(leaderboardTrackSubtitle('reputation')).toBe(
      'All-time weighted score'
    );
    expect(leaderboardTrackSubtitle('influence')).toBe('Locked SOCIAL × time');
    expect(leaderboardTrackSubtitle('earners')).toBe('All-time SOCIAL earned');
    expect(leaderboardPrimaryUnit('influence')).toBe('Boost');
    expect(leaderboardPrimaryUnit('earners')).toBe('SOCIAL');
    expect(leaderboardPrimaryUnit('reputation')).toBe('Score');
    expect(leaderboardTrackHint('influence')).toMatch(/influence/i);
    expect(leaderboardTrackHint('earners')).toBeNull();
  });

  it('builds a quiet you-line', () => {
    expect(leaderboardViewerLine({ rank: 47, primary: '12.4' })).toBe(
      "You're #47 · 12.4"
    );
  });

  it('builds share copy for leaderboard tracks', () => {
    expect(leaderboardShareCopy('reputation').text).toMatch(
      /reputation rankings/i
    );
  });

  it('computes percent of leader', () => {
    expect(pctOfLeader(50, 100)).toBe(50);
    expect(pctOfLeader(0, 100)).toBe(0);
    expect(pctOfLeader(10, 0)).toBe(0);
  });

  it('finds viewer entry case-insensitively', () => {
    const rows = [
      { accountId: 'Alice.near', rank: 1 },
      { accountId: 'bob.near', rank: 2 },
    ];
    expect(findViewerEntry(rows, 'alice.near')?.index).toBe(0);
    expect(findViewerEntry(rows, 'carol.near')).toBeNull();
  });

  it('labels tied competition ranks and keeps dense order', () => {
    expect(leaderboardRankLabel(7, false)).toBe('7');
    expect(leaderboardRankLabel(12, true)).toBe('T12');
    const rows = [
      { rank: 9 },
      { rank: 9 },
      { rank: 11 },
      { rank: 12 },
      { rank: 12 },
    ];
    const presentation = computeLeaderboardRankPresentation(rows);
    expect(presentation[0]?.rankLabel).toBe('T9');
    expect(presentation[0]?.denseIndex).toBe(1);
    expect(presentation[1]?.rankLabel).toBe('T9');
    expect(presentation[1]?.denseIndex).toBe(2);
    expect(presentation[2]?.rankLabel).toBe('11');
    expect(presentation[3]?.rankLabel).toBe('T12');
    expect(presentation[4]?.denseIndex).toBe(5);
  });

  it('filters zero earners from the earners board', () => {
    const rows = [
      { accountId: 'a', totalEarned: '1.0', rank: 1 },
      { accountId: 'b', totalEarned: '0', rank: 23 },
      { accountId: 'c', totalEarned: '0.00', rank: 23 },
    ];
    expect(isLeaderboardEarnerRanked(rows[0]!)).toBe(true);
    expect(isLeaderboardEarnerRanked(rows[1]!)).toBe(false);
    expect(filterLeaderboardEarnerRows(rows)).toHaveLength(1);
  });
});
