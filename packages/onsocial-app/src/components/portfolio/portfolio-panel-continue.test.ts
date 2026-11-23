import { describe, expect, it } from 'vitest';
import { continuePortfolioShelfHref } from './portfolio-panel-continue';

describe('continuePortfolioShelfHref', () => {
  it('hard-navs catalog and cold landings to the solid Writing page', () => {
    expect(
      continuePortfolioShelfHref({
        href: '/@alice.testnet/writing',
        retainFeedArticle: false,
      })
    ).toBe('hard');
  });

  it('soft-replaces when a Home hop parked the feed article under Writing', () => {
    expect(
      continuePortfolioShelfHref({
        href: '/@alice.testnet/writing',
        retainFeedArticle: true,
      })
    ).toBe('soft');
  });
});
