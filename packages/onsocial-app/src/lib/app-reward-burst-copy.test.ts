import { describe, expect, it } from 'vitest';
import {
  APP_REWARD_BURST_AGGREGATE_MS,
  APP_REWARD_BURST_STAND_BATCH_MS,
  buildBurstFlushSignature,
  compressAppRewardBurstReasons,
  formatShortBurstReason,
  resolveBurstAggregateDelayMs,
  resolveBurstDisplayAmount,
  shouldShowBurstCelebration,
} from './app-reward-burst-copy';

const CREDIT_YOCTO = '100000000000000000';
const CREDIT_AMOUNT = 100_000_000_000_000_000n;

describe('buildBurstFlushSignature', () => {
  it('is stable for the same credited batch', () => {
    const events = [
      { amountYocto: CREDIT_YOCTO, action: 'stand_given' as const, targetAccountId: 'alice' },
      { amountYocto: CREDIT_YOCTO, action: 'daily_active' as const },
    ];
    expect(buildBurstFlushSignature(events)).toBe(buildBurstFlushSignature(events));
  });
});

describe('resolveBurstDisplayAmount', () => {
  it('sums every credited action in the batch', () => {
    expect(
      resolveBurstDisplayAmount([
        { amountYocto: CREDIT_YOCTO, action: 'stand_given', targetAccountId: 'alice' },
        { amountYocto: CREDIT_YOCTO, action: 'daily_active' },
      ])
    ).toBe(CREDIT_AMOUNT * 2n);
  });

  it('sums a single credit', () => {
    expect(
      resolveBurstDisplayAmount([
        { amountYocto: CREDIT_YOCTO, action: 'profile_created' },
      ])
    ).toBe(CREDIT_AMOUNT);
  });
});

describe('shouldShowBurstCelebration', () => {
  it('hides daily-only follow-up pills', () => {
    expect(
      shouldShowBurstCelebration([{ amountYocto: CREDIT_YOCTO, action: 'daily_active' }])
    ).toBe(false);
  });
});

describe('resolveBurstAggregateDelayMs', () => {
  it('waits longer when stand may pair with mutual and daily credits', () => {
    expect(
      resolveBurstAggregateDelayMs([{ action: 'stand_given', targetAccountId: 'alice' }])
    ).toBe(APP_REWARD_BURST_STAND_BATCH_MS);
  });

  it('waits longer when daily returns before stand', () => {
    expect(resolveBurstAggregateDelayMs([{ action: 'daily_active' }])).toBe(
      APP_REWARD_BURST_STAND_BATCH_MS
    );
  });

  it('uses the default aggregate window for other credits', () => {
    expect(resolveBurstAggregateDelayMs([{ action: 'profile_created' }])).toBe(
      APP_REWARD_BURST_AGGREGATE_MS
    );
  });
});

describe('compressAppRewardBurstReasons', () => {
  it('prefers profile display name over account handle', () => {
    expect(
      compressAppRewardBurstReasons([
        {
          action: 'stand_given',
          targetAccountId: 'alice.near',
          targetDisplayName: 'Maya',
        },
      ])
    ).toEqual(['Stand · Maya']);
  });

  it('falls back to short handle when no display name', () => {
    expect(
      compressAppRewardBurstReasons([
        { action: 'stand_given', targetAccountId: 'alice.near' },
      ])
    ).toEqual(['Stand · alice']);
  });

  it('prefers mutual stand over stand in one burst', () => {
    expect(
      compressAppRewardBurstReasons([
        { action: 'stand_given', targetAccountId: 'alice.near' },
        { action: 'mutual_stand_created', targetAccountId: 'alice.near' },
      ])
    ).toEqual(['Mutual stand · alice']);
  });

  it('keeps daily check-in when stand is in the same burst', () => {
    expect(
      compressAppRewardBurstReasons([
        { action: 'stand_given', targetAccountId: 'alice.near' },
        { action: 'daily_active' },
      ])
    ).toEqual(['Stand · alice', 'Daily check-in']);
  });
});

describe('formatShortBurstReason', () => {
  it('joins stand and daily on one line', () => {
    expect(
      formatShortBurstReason(['Stand · alice', 'Daily check-in'])
    ).toBe('Stand · alice · Daily check-in');
  });
});
