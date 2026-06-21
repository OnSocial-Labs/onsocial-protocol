import { describe, expect, it } from 'vitest';
import { splitRoutingTargetDisplay } from '@/features/governance/governance-proposal-routing-display';

describe('splitRoutingTargetDisplay', () => {
  it('splits min spend from routing shares', () => {
    expect(
      splitRoutingTargetDisplay(
        'min 100 SOCIAL · 95% pool · 4% boost credits · 1% burn'
      )
    ).toEqual({
      minLabel: 'min 100 SOCIAL',
      routingLabel: '95% pool · 4% boost credits · 1% burn',
      routingParts: ['95% pool', '4% boost credits', '1% burn'],
    });
  });

  it('keeps routing-only summaries intact', () => {
    expect(splitRoutingTargetDisplay('95% pool · 5% burn')).toEqual({
      minLabel: null,
      routingLabel: '95% pool · 5% burn',
      routingParts: ['95% pool', '5% burn'],
    });
  });
});
