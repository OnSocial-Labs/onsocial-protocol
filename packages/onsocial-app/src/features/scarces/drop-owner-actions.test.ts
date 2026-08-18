import { describe, expect, it } from 'vitest';
import {
  canCancelDrop,
  canDeleteDrop,
  canWithdrawUnclaimedRefunds,
} from './drop-owner-actions';

describe('drop refund owner gates', () => {
  it('allows cancel on any non-cancelled status', () => {
    expect(canCancelDrop('live')).toBe(true);
    expect(canCancelDrop('sold_out')).toBe(true);
    expect(canCancelDrop('cancelled')).toBe(false);
  });

  it('blocks delete once cancelled even with zero minted', () => {
    expect(canDeleteDrop(0, 'live')).toBe(true);
    expect(canDeleteDrop(0, 'cancelled')).toBe(false);
    expect(canDeleteDrop(2, 'live')).toBe(false);
  });

  it('allows withdraw only after the claim window with leftover pool', () => {
    expect(
      canWithdrawUnclaimedRefunds({
        cancelled: true,
        refundDeadlineMs: 1_000,
        refundPoolYocto: '100',
        nowMs: 2_000,
      })
    ).toBe(true);
    expect(
      canWithdrawUnclaimedRefunds({
        cancelled: true,
        refundDeadlineMs: 3_000,
        refundPoolYocto: '100',
        nowMs: 2_000,
      })
    ).toBe(false);
    expect(
      canWithdrawUnclaimedRefunds({
        cancelled: true,
        refundDeadlineMs: 1_000,
        refundPoolYocto: '0',
        nowMs: 2_000,
      })
    ).toBe(false);
  });
});
