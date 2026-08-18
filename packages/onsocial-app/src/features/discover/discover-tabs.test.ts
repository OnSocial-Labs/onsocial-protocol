import { describe, expect, it } from 'vitest';
import {
  appDiscoverTabHref,
  applyDiscoverTabParam,
  discoverTabForQueryDraft,
  discoverTabLabel,
  discoverTopicFilterPrefix,
  isDiscoverDaosTab,
  isDiscoverGuildsTab,
  isDiscoverHubsTab,
  isDiscoverProfilesTab,
  parseDiscoverTab,
} from '@/features/discover/discover-tabs';

describe('discover-tabs', () => {
  it('parses tab query params with trending default', () => {
    expect(parseDiscoverTab(null)).toBe('trending');
    expect(parseDiscoverTab('trending')).toBe('trending');
    expect(parseDiscoverTab('topics')).toBe('topics');
    expect(parseDiscoverTab('tickers')).toBe('tickers');
    expect(parseDiscoverTab('profiles')).toBe('profiles');
    expect(parseDiscoverTab('daos')).toBe('daos');
    expect(parseDiscoverTab('guilds')).toBe('guilds');
    expect(parseDiscoverTab('hubs')).toBe('hubs');
    expect(parseDiscoverTab('people')).toBe('profiles');
    expect(parseDiscoverTab('nope')).toBe('trending');
  });

  it('labels tabs', () => {
    expect(discoverTabLabel('trending')).toBe('Trending');
    expect(discoverTabLabel('profiles')).toBe('Profiles');
    expect(discoverTabLabel('daos')).toBe('DAOs');
    expect(discoverTabLabel('guilds')).toBe('Guilds');
    expect(discoverTabLabel('hubs')).toBe('Hubs');
    expect(discoverTabLabel('topics')).toBe('Topics');
    expect(discoverTabLabel('tickers')).toBe('Tickers');
  });

  it('builds root Discover tab hrefs', () => {
    expect(appDiscoverTabHref('trending')).toBe('/discover');
    expect(appDiscoverTabHref('hubs')).toBe('/discover?tab=hubs');
    expect(appDiscoverTabHref('daos')).toBe('/discover?tab=daos');
  });

  it('omits default trending from URL params', () => {
    const params = new URLSearchParams('tab=topics&q=near');
    applyDiscoverTabParam(params, 'trending');
    expect(params.get('tab')).toBeNull();
    applyDiscoverTabParam(params, 'profiles');
    expect(params.get('tab')).toBe('profiles');
  });

  it('switches tab from # / $ drafts only', () => {
    expect(discoverTabForQueryDraft('#near', 'trending')).toBe('topics');
    expect(discoverTabForQueryDraft('$SOCIAL', 'trending')).toBe('tickers');
    expect(discoverTabForQueryDraft('alice', 'trending')).toBe('trending');
    expect(discoverTabForQueryDraft('alice', 'profiles')).toBe('profiles');
    expect(discoverTabForQueryDraft('alice', 'topics')).toBe('topics');
  });

  it('strips prefixes for topic/ticker filters', () => {
    expect(discoverTopicFilterPrefix('#NEAR', 'topics')).toBe('near');
    expect(discoverTopicFilterPrefix('$SOCIAL', 'tickers')).toBe('social');
    expect(discoverTopicFilterPrefix('social', 'tickers')).toBe('social');
    expect(discoverTopicFilterPrefix('alice', 'profiles')).toBe('');
  });

  it('identifies the profiles list tab', () => {
    expect(isDiscoverProfilesTab('profiles')).toBe(true);
    expect(isDiscoverProfilesTab('trending')).toBe(false);
  });

  it('identifies the DAOs catalog tab', () => {
    expect(isDiscoverDaosTab('daos')).toBe(true);
    expect(isDiscoverDaosTab('profiles')).toBe(false);
  });

  it('identifies the Guilds browse tab', () => {
    expect(isDiscoverGuildsTab('guilds')).toBe(true);
    expect(isDiscoverGuildsTab('daos')).toBe(false);
  });

  it('identifies the Hubs directory tab', () => {
    expect(isDiscoverHubsTab('hubs')).toBe(true);
    expect(isDiscoverHubsTab('guilds')).toBe(false);
  });
});
