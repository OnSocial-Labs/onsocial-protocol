import { describe, expect, it } from 'vitest';
import {
  isFullPagePanelLayout,
  isOverlayInterceptActive,
  isPortfolioOverlayPath,
  parseOverlayPanelKey,
  resolveOverlayPanelChrome,
  shouldOpenPortfolioGlassOverlay,
} from './overlay-routes';

describe('parseOverlayPanelKey', () => {
  it('parses standing tab routes', () => {
    expect(parseOverlayPanelKey('/@alice.testnet/standing/incoming')).toBe(
      'standing:incoming'
    );
    expect(parseOverlayPanelKey('/@alice.testnet/standing/outgoing')).toBe(
      'standing:outgoing'
    );
    expect(parseOverlayPanelKey('/@alice.testnet/standing/mutual')).toBe(
      'standing:mutual'
    );
  });

  it('defaults bare standing routes to incoming', () => {
    expect(parseOverlayPanelKey('/@alice.testnet/standing')).toBe(
      'standing:incoming'
    );
  });

  it('parses other overlay panels', () => {
    expect(parseOverlayPanelKey('/@alice.testnet/discover')).toBe('discover');
    expect(parseOverlayPanelKey('/@alice.testnet/discover?q=test')).toBe(
      'discover'
    );
    expect(parseOverlayPanelKey('/@alice.testnet/feed')).toBe('feed');
    expect(parseOverlayPanelKey('/@alice.testnet/endorsements')).toBe(
      'endorsements'
    );
    expect(parseOverlayPanelKey('/@alice.testnet/reputation')).toBe(
      'reputation'
    );
  });

  it('returns null for portfolio root and unrelated paths', () => {
    expect(parseOverlayPanelKey('/@alice.testnet')).toBeNull();
    expect(parseOverlayPanelKey('/@alice.testnet/posts/abc')).toBeNull();
  });
});

describe('isPortfolioOverlayPath', () => {
  it('matches overlay drawer paths', () => {
    expect(isPortfolioOverlayPath('/@alice.testnet/discover')).toBe(true);
  });

  it('does not match portfolio root', () => {
    expect(isPortfolioOverlayPath('/@alice.testnet')).toBe(false);
  });
});

describe('isOverlayInterceptActive', () => {
  it('is false for the default @overlay slot (hard refresh)', () => {
    expect(isOverlayInterceptActive([])).toBe(false);
  });

  it('is true when an intercept overlay route is mounted', () => {
    expect(isOverlayInterceptActive(['standing', 'incoming'])).toBe(true);
    expect(isOverlayInterceptActive(['discover'])).toBe(true);
  });
});

describe('isFullPagePanelLayout', () => {
  it('is false when the portfolio page is the active child', () => {
    expect(isFullPagePanelLayout([])).toBe(false);
  });

  it('is true for full-page panel routes', () => {
    expect(isFullPagePanelLayout(['standing', 'incoming'])).toBe(true);
    expect(isFullPagePanelLayout(['discover'])).toBe(true);
    expect(isFullPagePanelLayout(['feed'])).toBe(true);
  });
});

describe('shouldOpenPortfolioGlassOverlay', () => {
  it('opens on soft intercept (panel URL, portfolio still mounted)', () => {
    expect(
      shouldOpenPortfolioGlassOverlay('/@alice.testnet/standing/incoming', [])
    ).toBe(true);
    expect(shouldOpenPortfolioGlassOverlay('/@alice.testnet/discover', [])).toBe(
      true
    );
  });

  it('does not open on hard refresh full-page panel URLs', () => {
    expect(
      shouldOpenPortfolioGlassOverlay('/@alice.testnet/standing/incoming', [
        'standing',
        'incoming',
      ])
    ).toBe(false);
    expect(
      shouldOpenPortfolioGlassOverlay('/@alice.testnet/discover', ['discover'])
    ).toBe(false);
  });

  it('does not open on portfolio root', () => {
    expect(shouldOpenPortfolioGlassOverlay('/@alice.testnet', [])).toBe(false);
  });
});

describe('resolveOverlayPanelChrome', () => {
  it('expects toolbar chrome for standing and discover', () => {
    expect(resolveOverlayPanelChrome('standing:incoming')).toEqual({
      ariaTitle: 'Standing',
      expectsToolbar: true,
    });
    expect(resolveOverlayPanelChrome('discover')).toEqual({
      ariaTitle: 'Discover',
      expectsToolbar: true,
    });
  });

  it('uses panel labels for simple overlay panels', () => {
    expect(resolveOverlayPanelChrome('feed')).toEqual({
      ariaTitle: 'Feed',
      title: 'Feed',
      expectsToolbar: false,
    });
  });

  it('returns null for unknown keys', () => {
    expect(resolveOverlayPanelChrome(null)).toBeNull();
    expect(resolveOverlayPanelChrome('unknown')).toBeNull();
  });
});
