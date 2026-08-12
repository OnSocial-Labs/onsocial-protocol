import { describe, expect, it } from 'vitest';
import { staffAttendanceLine } from '@/features/scarces/ticket-attendance';

describe('staffAttendanceLine', () => {
  it('covers single-use door admit', () => {
    expect(
      staffAttendanceLine({
        voice: 'admit',
        minted: 200,
        redeemedCount: 47,
        fullyRedeemedCount: 47,
        maxRedeems: 1,
      })
    ).toBe('Checked in 47 of 200');
  });

  it('covers single-use coupon redeem', () => {
    expect(
      staffAttendanceLine({
        voice: 'redeem',
        minted: 50,
        redeemedCount: 12,
        fullyRedeemedCount: 12,
        maxRedeems: 1,
      })
    ).toBe('Redeemed 12 of 50');
  });

  it('covers multi-redeem coupons', () => {
    expect(
      staffAttendanceLine({
        voice: 'redeem',
        minted: 100,
        redeemedCount: 320,
        fullyRedeemedCount: 40,
        maxRedeems: 5,
      })
    ).toBe('320 redeems · 40 of 100 used up');
  });

  it('covers empty mint', () => {
    expect(
      staffAttendanceLine({
        voice: 'admit',
        minted: 0,
        redeemedCount: 0,
        fullyRedeemedCount: 0,
        maxRedeems: 1,
      })
    ).toBe('No passes minted yet');
  });
});
