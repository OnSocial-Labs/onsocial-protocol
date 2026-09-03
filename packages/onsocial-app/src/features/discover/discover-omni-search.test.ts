import { describe, expect, it } from 'vitest';
import {
  classifyDiscoverSearch,
  discoverOmniTargetHref,
  discoverPeopleSearchQuery,
  discoverSearchAriaLabel,
  discoverSearchFocusHint,
  isDiscoverPeopleSearchActive,
  isDiscoverTopicDraft,
  showDiscoverTrendingStrip,
} from '@/features/discover/discover-omni-search';

describe('classifyDiscoverSearch', () => {
  it('treats bare text and empty as people search', () => {
    expect(classifyDiscoverSearch('')).toEqual({ kind: 'people' });
    expect(classifyDiscoverSearch('  ')).toEqual({ kind: 'people' });
    expect(classifyDiscoverSearch('alice')).toEqual({ kind: 'people' });
    expect(classifyDiscoverSearch('alice.near')).toEqual({ kind: 'people' });
  });

  it('routes explicit #topics to Home hashtag focus', () => {
    expect(classifyDiscoverSearch('#NEAR')).toEqual({
      kind: 'hashtag',
      value: 'near',
      href: '/home?tag=near',
    });
  });

  it('routes explicit $tickers to Home ticker focus', () => {
    expect(classifyDiscoverSearch('$SOCIAL')).toEqual({
      kind: 'ticker',
      value: 'social',
      href: '/home?ticker=social',
    });
  });

  it('falls back to people search for invalid # / $ drafts', () => {
    expect(classifyDiscoverSearch('$100')).toEqual({ kind: 'people' });
    expect(classifyDiscoverSearch('#')).toEqual({ kind: 'people' });
    expect(classifyDiscoverSearch('$')).toEqual({ kind: 'people' });
  });

  it('exposes a target href only for topic/ticker intents', () => {
    expect(discoverOmniTargetHref('alice')).toBeNull();
    expect(discoverOmniTargetHref('#gm')).toBe('/home?tag=gm');
    expect(discoverOmniTargetHref('$social')).toBe('/home?ticker=social');
  });
});

describe('discover omni query helpers', () => {
  it('detects topic drafts and keeps them out of people search', () => {
    expect(isDiscoverTopicDraft('#near')).toBe(true);
    expect(isDiscoverTopicDraft('$SOCIAL')).toBe(true);
    expect(isDiscoverTopicDraft('alice')).toBe(false);
    expect(discoverPeopleSearchQuery('#near')).toBe('');
    expect(discoverPeopleSearchQuery('alice')).toBe('alice');
    expect(isDiscoverPeopleSearchActive('#near')).toBe(false);
    expect(isDiscoverPeopleSearchActive('alice')).toBe(true);
  });

  it('shows trending strip only on empty browse', () => {
    expect(showDiscoverTrendingStrip('')).toBe(true);
    expect(showDiscoverTrendingStrip('#near')).toBe(false);
    expect(showDiscoverTrendingStrip('alice')).toBe(false);
  });
});

describe('discover search focus hint', () => {
  it('names the surface without repeating Search', () => {
    expect(discoverSearchFocusHint('daos')).toBe('DAOs');
    expect(discoverSearchFocusHint('guilds')).toBe('Guilds');
    expect(discoverSearchFocusHint('hubs')).toBe('Hubs');
    expect(discoverSearchFocusHint('profiles', 'hiring')).toBe('Role title');
    expect(discoverSearchFocusHint('trending')).toBe(
      'People, #topics, $tickers'
    );
  });

  it('keeps aria labels as search actions', () => {
    expect(discoverSearchAriaLabel('daos')).toBe('Search DAOs');
    expect(discoverSearchAriaLabel('profiles', 'hiring')).toBe(
      'Search open roles'
    );
  });
});
