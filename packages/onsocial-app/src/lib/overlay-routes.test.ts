import { describe, expect, it } from 'vitest';
import {
  discoverPath,
  isFullPagePanelLayout,
  isOverlayInterceptActive,
  isPortfolioOverlayPath,
  parseOverlayPanelKey,
  parsePortfolioSheetParam,
  portfolioBoostPath,
  portfolioCollectiblesPath,
  portfolioFeedPath,
  resolveOverlayPanelChrome,
  shouldOpenPortfolioGlassOverlay,
} from './overlay-routes';

describe('portfolioCollectiblesPath', () => {
  it('builds the held catalog route and optional kind filter', () => {
    expect(portfolioCollectiblesPath('alice.testnet')).toBe(
      '/@alice.testnet/collectibles'
    );
    expect(portfolioCollectiblesPath('alice.testnet', { kind: 'audio' })).toBe(
      '/@alice.testnet/collectibles?kind=audio'
    );
    expect(portfolioCollectiblesPath('alice.testnet', { kind: 'all' })).toBe(
      '/@alice.testnet/collectibles'
    );
    expect(portfolioCollectiblesPath('alice.testnet', { q: 'night' })).toBe(
      '/@alice.testnet/collectibles?q=night'
    );
    expect(
      portfolioCollectiblesPath('alice.testnet', { kind: 'audio', q: 'jazz' })
    ).toBe('/@alice.testnet/collectibles?kind=audio&q=jazz');
  });
});

describe('portfolioBoostPath', () => {
  it('deep-links the owner boost sheet', () => {
    expect(parsePortfolioSheetParam('boost')).toBe('boost');
    expect(parsePortfolioSheetParam('Boost')).toBe('boost');
    expect(parsePortfolioSheetParam('wallet')).toBeNull();
    expect(portfolioBoostPath('alice.testnet')).toBe(
      '/@alice.testnet?sheet=boost'
    );
  });
});

describe('portfolioFeedPath', () => {
  it('deep-links the page drawer via the one-shot feed anchor', () => {
    expect(portfolioFeedPath('alice.testnet')).toBe(
      '/@alice.testnet#portfolio-feed'
    );
  });
});

describe('discoverPath', () => {
  it('defaults to bare discover (Trending)', () => {
    expect(discoverPath('alice.testnet')).toBe('/@alice.testnet/discover');
  });

  it('deep-links Profiles from Standings entry', () => {
    expect(discoverPath('alice.testnet', { tab: 'profiles' })).toBe(
      '/@alice.testnet/discover?tab=profiles'
    );
  });

  it('deep-links DAOs catalog tab', () => {
    expect(discoverPath('alice.testnet', { tab: 'daos' })).toBe(
      '/@alice.testnet/discover?tab=daos'
    );
  });

  it('deep-links Guilds browse tab', () => {
    expect(discoverPath('alice.testnet', { tab: 'guilds' })).toBe(
      '/@alice.testnet/discover?tab=guilds'
    );
  });

  it('deep-links Hubs directory tab', () => {
    expect(discoverPath('alice.testnet', { tab: 'hubs' })).toBe(
      '/@alice.testnet/discover?tab=hubs'
    );
  });

  it('combines tab and search query', () => {
    expect(
      discoverPath('alice.testnet', { tab: 'profiles', q: 'near' })
    ).toBe('/@alice.testnet/discover?tab=profiles&q=near');
  });
});

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
    expect(parseOverlayPanelKey('/@alice.testnet/collectibles')).toBe(
      'collectibles'
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

  it('does not match full-page panel routes', () => {
    expect(isPortfolioOverlayPath('/@alice.testnet/collectibles')).toBe(false);
    expect(isPortfolioOverlayPath('/@alice.testnet/feed')).toBe(false);
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
    expect(isFullPagePanelLayout(['collectibles'])).toBe(true);
    expect(isFullPagePanelLayout(['posts', 'abc'])).toBe(true);
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

  it('does not open for feed (page drawer instead)', () => {
    expect(shouldOpenPortfolioGlassOverlay('/@alice.testnet/feed', [])).toBe(
      false
    );
  });

  it('does not open for collectibles (PanelPage vault)', () => {
    expect(
      shouldOpenPortfolioGlassOverlay('/@alice.testnet/collectibles', [])
    ).toBe(false);
    expect(
      shouldOpenPortfolioGlassOverlay('/@alice.testnet/collectibles', [
        'collectibles',
      ])
    ).toBe(false);
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
    expect(resolveOverlayPanelChrome('endorsements')).toEqual({
      ariaTitle: 'Endorsements',
      title: 'Endorsements',
      expectsToolbar: false,
    });
    expect(resolveOverlayPanelChrome('reputation')).toEqual({
      ariaTitle: 'Reputation',
      title: 'Reputation',
      expectsToolbar: false,
    });
    expect(resolveOverlayPanelChrome('collectibles')).toEqual({
      ariaTitle: 'Collectibles',
      title: 'Collectibles',
      expectsToolbar: false,
    });
  });

  it('returns null for unknown keys', () => {
    expect(resolveOverlayPanelChrome(null)).toBeNull();
    expect(resolveOverlayPanelChrome('unknown')).toBeNull();
  });
});
