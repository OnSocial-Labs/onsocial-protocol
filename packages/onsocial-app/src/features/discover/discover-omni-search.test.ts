import { describe, expect, it } from 'vitest';
import {
  classifyDiscoverSearch,
  discoverOmniTargetHref,
  discoverPeopleSearchQuery,
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
