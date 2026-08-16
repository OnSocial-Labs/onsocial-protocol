import { describe, expect, it } from 'vitest';
import {
  commitmentLabel,
  formatReputationScore,
  pctOfLeader,
  reputationTierLabel,
} from '@/lib/leaderboard';

describe('leaderboard helpers', () => {
  it('formats reputation scores', () => {
    expect(formatReputationScore(0)).toBe('0');
    expect(formatReputationScore(12.4)).toBe('12.4');
    expect(formatReputationScore(120)).toBe('120');
    expect(formatReputationScore(12500)).toBe('12.5K');
  });

  it('maps commitment and tier labels', () => {
    expect(commitmentLabel(48)).toBe('Citadel');
    expect(commitmentLabel(3)).toBe('Scout');
    expect(reputationTierLabel(1)).toBe('Legend');
    expect(reputationTierLabel(12)).toBe('Active');
  });

  it('computes percent of leader', () => {
    expect(pctOfLeader(50, 100)).toBe(50);
    expect(pctOfLeader(0, 100)).toBe(0);
    expect(pctOfLeader(10, 0)).toBe(0);
  });
});
