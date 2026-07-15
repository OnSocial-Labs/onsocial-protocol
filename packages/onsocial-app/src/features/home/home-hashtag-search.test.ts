import { describe, expect, it } from 'vitest';
import {
  extractHashtagsFromText,
  homeHashtagEmptyCopy,
  homeHashtagSubtitle,
  isValidHashtagSlug,
  normalizeHashtagQuery,
  parseHashtagCommit,
  splitTextWithHashtags,
} from '@/features/home/home-hashtag-search';

describe('home-hashtag-search', () => {
  it('normalizes drafts', () => {
    expect(normalizeHashtagQuery(' #OnChain ')).toBe('onchain');
    expect(normalizeHashtagQuery('gm')).toBe('gm');
  });

  it('extracts tags from post body', () => {
    expect(extractHashtagsFromText('#NEAR is the chain.')).toEqual(['near']);
    expect(extractHashtagsFromText('hello #gm and #OnSocial #gm')).toEqual([
      'gm',
      'onsocial',
    ]);
    expect(extractHashtagsFromText('no tags here')).toEqual([]);
  });

  it('segments text for green composer highlight', () => {
    expect(splitTextWithHashtags('#NEAR is cool')).toEqual([
      { type: 'hashtag', value: '#NEAR' },
      { type: 'text', value: ' is cool' },
    ]);
  });

  it('validates and commits slugs', () => {
    expect(isValidHashtagSlug('onchain')).toBe(true);
    expect(isValidHashtagSlug('Bad')).toBe(false);
    expect(parseHashtagCommit('#gm')).toBe('gm');
    expect(parseHashtagCommit('g')).toBe('g');
    expect(parseHashtagCommit('#')).toBeNull();
    expect(parseHashtagCommit('no spaces')).toBeNull();
  });

  it('copy includes tag', () => {
    expect(homeHashtagSubtitle('gm')).toBe('Posts tagged #gm.');
    expect(homeHashtagEmptyCopy('gm')).toMatch(/#gm/);
  });
});
