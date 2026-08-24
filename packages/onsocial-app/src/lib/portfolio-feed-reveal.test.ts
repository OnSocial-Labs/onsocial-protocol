import { describe, expect, it } from 'vitest';
import {
  PORTFOLIO_FEED_LOCKED_MAX_SCROLL_PX,
  PORTFOLIO_FEED_REVEAL_LEAD_PX,
  shouldRevealPortfolioFeed,
} from './portfolio-feed-reveal';

describe('shouldRevealPortfolioFeed', () => {
  const clientHeight = 800;

  it('does not reveal on load for a scrollable hero (blocks scroll restoration)', () => {
    const scrollHeight = clientHeight + 240;
    expect(
      shouldRevealPortfolioFeed({
        scrollTop: 180,
        scrollHeight,
        clientHeight,
        userGestured: false,
      })
    ).toBe(false);
  });

  it('reveals near the hero tail after a user scroll gesture', () => {
    const scrollHeight = clientHeight + 240;
    expect(
      shouldRevealPortfolioFeed({
        scrollTop: scrollHeight - clientHeight - 20,
        scrollHeight,
        clientHeight,
        userGestured: true,
      })
    ).toBe(true);
  });

  it('does not reveal mid-hero even after a gesture', () => {
    const scrollHeight = clientHeight + 240;
    expect(
      shouldRevealPortfolioFeed({
        scrollTop: 80,
        scrollHeight,
        clientHeight,
        userGestured: true,
      })
    ).toBe(false);
  });

  it('reveals locked faces on downward wheel / touch intent only', () => {
    expect(
      shouldRevealPortfolioFeed({
        scrollTop: 0,
        scrollHeight: clientHeight + PORTFOLIO_FEED_LOCKED_MAX_SCROLL_PX,
        clientHeight,
        scrollIntentDelta: 12,
        userGestured: false,
      })
    ).toBe(true);

    expect(
      shouldRevealPortfolioFeed({
        scrollTop: 0,
        scrollHeight: clientHeight + PORTFOLIO_FEED_LOCKED_MAX_SCROLL_PX,
        clientHeight,
        userGestured: true,
      })
    ).toBe(false);
  });

  it('reveals at the tail on wheel intent without mid-scroll scrollTop', () => {
    const scrollHeight = clientHeight + 200;
    const scrollTop = scrollHeight - clientHeight - 8;
    expect(
      shouldRevealPortfolioFeed({
        scrollTop,
        scrollHeight,
        clientHeight,
        scrollIntentDelta: 6,
        userGestured: false,
      })
    ).toBe(true);
  });

  it('respects reveal lead at the hero tail', () => {
    const scrollHeight = clientHeight + 200;
    const scrollTop =
      scrollHeight - clientHeight - PORTFOLIO_FEED_REVEAL_LEAD_PX + 4;
    expect(
      shouldRevealPortfolioFeed({
        scrollTop,
        scrollHeight,
        clientHeight,
        userGestured: true,
      })
    ).toBe(true);
  });
});
