import { afterEach, describe, expect, it } from 'vitest';
import {
  beginPortfolioShelfHop,
  endPortfolioShelfHop,
  getPortfolioShelfHopSnapshot,
  isPortfolioShelfHop,
  markWritingShelfArrived,
  releaseWritingShelfHold,
  shouldRetainOpenedFeed,
  writingShelfAlreadyCovered,
} from '@/lib/portfolio-shelf-hop';

afterEach(() => {
  endPortfolioShelfHop();
  releaseWritingShelfHold();
});

describe('shouldRetainOpenedFeed', () => {
  it('keeps the open reader while the hop is leaving Home', () => {
    expect(
      shouldRetainOpenedFeed({
        onFeed: false,
        shelfHop: true,
        holdAccountId: 'alice.testnet',
        pathname: '/@alice.testnet',
      })
    ).toBe(true);
  });

  it('keeps that same reader under the Writing shelf', () => {
    expect(
      shouldRetainOpenedFeed({
        onFeed: false,
        shelfHop: false,
        holdAccountId: 'alice.testnet',
        pathname: '/@alice.testnet/writing',
      })
    ).toBe(true);
  });

  it('uses the live feed once Home is on screen', () => {
    expect(
      shouldRetainOpenedFeed({
        onFeed: true,
        shelfHop: true,
        holdAccountId: 'alice.testnet',
        pathname: '/home',
      })
    ).toBe(false);
  });

  it('drops the reader when the person leaves Writing', () => {
    expect(
      shouldRetainOpenedFeed({
        onFeed: false,
        shelfHop: false,
        holdAccountId: 'alice.testnet',
        pathname: '/@alice.testnet',
      })
    ).toBe(false);
  });
});

describe('portfolio shelf hop', () => {
  it('covers with the reader name until the real shelf arrives', () => {
    beginPortfolioShelfHop({
      accountId: 'alice.testnet',
      titleLabel: 'Alice',
      avatarUrl: null,
    });
    expect(isPortfolioShelfHop()).toBe(true);
    expect(writingShelfAlreadyCovered()).toBe(true);
    expect(getPortfolioShelfHopSnapshot().face?.titleLabel).toBe('Alice');
    markWritingShelfArrived();
    expect(getPortfolioShelfHopSnapshot().arrived).toBe(true);
    endPortfolioShelfHop();
    expect(isPortfolioShelfHop()).toBe(false);
    expect(getPortfolioShelfHopSnapshot().holdAccountId).toBe('alice.testnet');
    releaseWritingShelfHold();
    expect(writingShelfAlreadyCovered()).toBe(false);
  });
});
