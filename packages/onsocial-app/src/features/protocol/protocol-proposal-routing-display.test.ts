import { describe, expect, it } from 'vitest';
import { splitRoutingTargetDisplay } from '@/features/protocol/protocol-proposal-routing-display';

describe('splitRoutingTargetDisplay', () => {
  it('splits min + routing segments', () => {
    expect(
      splitRoutingTargetDisplay('min 10 SOCIAL · 95% pool · 5% burn')
    ).toEqual({
      minLabel: 'min 10 SOCIAL',
      routingLabel: '95% pool · 5% burn',
      routingParts: ['95% pool', '5% burn'],
    });
  });

  it('keeps simple routing labels', () => {
    expect(splitRoutingTargetDisplay('95% pool · 5% burn')).toEqual({
      minLabel: null,
      routingLabel: '95% pool · 5% burn',
      routingParts: ['95% pool', '5% burn'],
    });
  });
});
