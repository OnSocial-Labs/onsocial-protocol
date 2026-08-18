import { describe, expect, it } from 'vitest';
import {
  DEFAULT_REFUND_CLAIM_DAYS,
  MIN_REFUND_CLAIM_DAYS,
  hasUnclaimedRefundPool,
  isRefundClaimWindowClosed,
  refundClaimDaysToNs,
  refundPoolDepositNearLabel,
  refundPoolDepositYocto,
  refundableTokenCount,
} from './drop-refund';

describe('refundableTokenCount', () => {
  it('subtracts fully redeemed from minted', () => {
    expect(refundableTokenCount(10, 3)).toBe(7);
    expect(refundableTokenCount(2, 5)).toBe(0);
    expect(refundableTokenCount(0, 0)).toBe(0);
  });
});

describe('refundClaimDaysToNs', () => {
  it('clamps to the contract minimum', () => {
    expect(refundClaimDaysToNs(1)).toBe(MIN_REFUND_CLAIM_DAYS * 86_400_000_000_000);
    expect(refundClaimDaysToNs(DEFAULT_REFUND_CLAIM_DAYS)).toBe(
      DEFAULT_REFUND_CLAIM_DAYS * 86_400_000_000_000
    );
  });
});

describe('refundPoolDepositYocto', () => {
  it('multiplies NEAR per token by refundable count', () => {
    expect(refundPoolDepositYocto('0.5', 2)).toBe(
      '1000000000000000000000000'
    );
    expect(refundPoolDepositYocto('1', 0)).toBe('0');
  });
});

describe('refundPoolDepositNearLabel', () => {
  it('formats the pool total for confirm copy', () => {
    expect(refundPoolDepositNearLabel('0.5', 2)).toBe('1');
  });
});

describe('refund window helpers', () => {
  it('detects closed windows and leftover pool', () => {
    expect(isRefundClaimWindowClosed(1_000, 2_000)).toBe(true);
    expect(isRefundClaimWindowClosed(3_000, 2_000)).toBe(false);
    expect(hasUnclaimedRefundPool('1')).toBe(true);
    expect(hasUnclaimedRefundPool('0')).toBe(false);
  });
});
