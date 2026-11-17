import { describe, expect, it } from 'vitest';
import { continuePortfolioShelfHref } from './portfolio-panel-continue';

describe('continuePortfolioShelfHref', () => {
  it('hard-navs a cold shelf landing so the streaming document can finish', () => {
    expect(
      continuePortfolioShelfHref({
        href: '/@alice.testnet/writing',
        shelfHopActive: false,
      })
    ).toBe('hard');
  });

  it('soft-replaces when a Home shelf hop already covered the face', () => {
    expect(
      continuePortfolioShelfHref({
        href: '/@alice.testnet/writing',
        shelfHopActive: true,
      })
    ).toBe('soft');
  });
});
