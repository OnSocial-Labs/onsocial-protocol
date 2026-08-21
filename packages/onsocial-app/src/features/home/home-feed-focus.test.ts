import { describe, expect, it } from 'vitest';
import {
  homeFeedFocusEmptyCopy,
  homeFeedFocusKey,
  homeFeedFocusPath,
  homeFeedFocusQueryValue,
  parseHomeFeedFocus,
  parseHomeFeedFocusCommit,
} from '@/features/home/home-feed-focus';
import {
  extractTickersFromText,
  formatTickerDisplay,
  homeTickerPath,
  isValidTickerSlug,
  normalizeTickerQuery,
  parseHomeTickerParam,
  parseTickerCommit,
} from '@/features/home/home-ticker-search';

describe('home-ticker-search', () => {
  it('normalizes and validates ticker slugs', () => {
    expect(normalizeTickerQuery('$SOCIAL')).toBe('social');
    expect(normalizeTickerQuery('Near')).toBe('near');
    expect(isValidTickerSlug('social')).toBe(true);
    expect(isValidTickerSlug('1bad')).toBe(false);
    expect(formatTickerDisplay('social')).toBe('$SOCIAL');
  });

  it('builds home ticker paths and parses params', () => {
    expect(homeTickerPath('SOCIAL')).toBe('/home?ticker=social');
    expect(homeTickerPath('$near')).toBe('/home?ticker=near');
    expect(parseHomeTickerParam('SOCIAL')).toBe('social');
    expect(parseHomeTickerParam('$100')).toBeNull();
  });

  it('extracts tickers from body text', () => {
    expect(extractTickersFromText('buy $SOCIAL and $near $SOCIAL')).toEqual([
      'social',
      'near',
    ]);
    expect(extractTickersFromText('costs $100 today')).toEqual([]);
    expect(parseTickerCommit('$social')).toBe('social');
  });
});

describe('home-feed-focus', () => {
  it('prefers ticker when both URL params exist', () => {
    expect(
      parseHomeFeedFocus({ tag: 'near', ticker: 'social' })
    ).toEqual({ kind: 'ticker', value: 'social' });
    expect(parseHomeFeedFocus({ tag: 'near', ticker: null })).toEqual({
      kind: 'hashtag',
      value: 'near',
    });
    expect(
      parseHomeFeedFocus({ tag: 'near', ticker: null, place: 'lisbon' })
    ).toEqual({ kind: 'place', value: 'lisbon' });
  });

  it('commits $ as ticker and # / bare as hashtag', () => {
    expect(parseHomeFeedFocusCommit('$SOCIAL')).toEqual({
      kind: 'ticker',
      value: 'social',
    });
    expect(parseHomeFeedFocusCommit('#near')).toEqual({
      kind: 'hashtag',
      value: 'near',
    });
    expect(parseHomeFeedFocusCommit('near')).toEqual({
      kind: 'hashtag',
      value: 'near',
    });
  });

  it('builds stable focus keys for effect deps', () => {
    expect(homeFeedFocusKey(null)).toBe('');
    expect(homeFeedFocusKey({ kind: 'hashtag', value: 'near' })).toBe(
      'hashtag:near'
    );
    expect(homeFeedFocusKey({ kind: 'ticker', value: 'social' })).toBe(
      'ticker:social'
    );
  });

  it('builds focus paths and copy', () => {
    expect(homeFeedFocusPath({ kind: 'ticker', value: 'social' })).toBe(
      '/home?ticker=social'
    );
    expect(homeFeedFocusQueryValue({ kind: 'ticker', value: 'social' })).toBe(
      '$SOCIAL'
    );
    expect(
      homeFeedFocusEmptyCopy({ kind: 'ticker', value: 'social' })
    ).toContain('$SOCIAL');
  });
});
