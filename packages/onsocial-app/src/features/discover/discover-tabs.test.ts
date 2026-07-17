import { describe, expect, it } from 'vitest';
import {
  applyDiscoverTabParam,
  discoverTabForQueryDraft,
  discoverTabLabel,
  discoverTopicFilterPrefix,
  parseDiscoverTab,
} from '@/features/discover/discover-tabs';

describe('discover-tabs', () => {
  it('parses tab query params with people default', () => {
    expect(parseDiscoverTab(null)).toBe('people');
    expect(parseDiscoverTab('topics')).toBe('topics');
    expect(parseDiscoverTab('tickers')).toBe('tickers');
    expect(parseDiscoverTab('nope')).toBe('people');
  });

  it('labels tabs', () => {
    expect(discoverTabLabel('people')).toBe('People');
    expect(discoverTabLabel('topics')).toBe('Topics');
    expect(discoverTabLabel('tickers')).toBe('Tickers');
  });

  it('omits default people from URL params', () => {
    const params = new URLSearchParams('tab=topics&q=near');
    applyDiscoverTabParam(params, 'people');
    expect(params.get('tab')).toBeNull();
    applyDiscoverTabParam(params, 'tickers');
    expect(params.get('tab')).toBe('tickers');
  });

  it('switches tab from # / $ drafts', () => {
    expect(discoverTabForQueryDraft('#near', 'people')).toBe('topics');
    expect(discoverTabForQueryDraft('$SOCIAL', 'people')).toBe('tickers');
    expect(discoverTabForQueryDraft('alice', 'topics')).toBe('topics');
  });

  it('strips prefixes for topic/ticker filters', () => {
    expect(discoverTopicFilterPrefix('#NEAR', 'topics')).toBe('near');
    expect(discoverTopicFilterPrefix('$SOCIAL', 'tickers')).toBe('social');
    expect(discoverTopicFilterPrefix('social', 'tickers')).toBe('social');
    expect(discoverTopicFilterPrefix('alice', 'people')).toBe('');
  });
});
