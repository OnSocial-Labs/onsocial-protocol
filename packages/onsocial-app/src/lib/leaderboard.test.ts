import { describe, expect, it } from 'vitest';
import {
  commitmentLabel,
  entriesForTrack,
  formatReputationComponent,
  formatReputationScore,
  pctOfLeader,
  reputationConfidenceLabel,
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
        leaderboardBoost: [{ accountId: 'a', lockedAmount: '0', effectiveBoost: '1', lockMonths: 1, rank: 1 }],
      })
    ).toHaveLength(1);
    expect(entriesForTrack('reputation', { reputationScores: [] })).toEqual([]);
    expect(entriesForTrack('earners', null)).toBeNull();
  });
});
