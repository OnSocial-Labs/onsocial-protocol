import { describe, expect, it } from 'vitest';
import {
  DROP_MAX_FACETS,
  dropFacetLabel,
  dropFacetsExtraFields,
  inferAudioFormatFromPlayableCount,
  normalizeDropFacets,
  parseAudioFormat,
  parseDropFacets,
} from './drop-facets';

describe('drop-facets', () => {
  it('keeps only allowed music genres, capped', () => {
    expect(
      normalizeDropFacets(
        ['rock', 'jazz', 'not-a-genre', 'indie', 'metal', 'blues'],
        'audio'
      )
    ).toEqual(['rock', 'jazz', 'indie']);
    expect(DROP_MAX_FACETS).toBe(3);
  });

  it('keeps only allowed writing subjects', () => {
    expect(normalizeDropFacets(['poetry', 'rock', 'fiction'], 'writing')).toEqual(
      ['poetry', 'fiction']
    );
  });

  it('returns no facets for unsupported media', () => {
    expect(normalizeDropFacets(['rock'], 'art')).toEqual([]);
    expect(normalizeDropFacets(['fiction'], null)).toEqual([]);
  });

  it('parses facets from extra with medium', () => {
    expect(
      parseDropFacets({ facets: ['blues', 'soul'] }, 'audio')
    ).toEqual(['blues', 'soul']);
    expect(parseDropFacets({ facets: ['blues'] }, 'writing')).toEqual([]);
  });

  it('labels known slugs', () => {
    expect(dropFacetLabel('hip-hop')).toBe('Hip-hop');
    expect(dropFacetLabel('scifi')).toBe('Sci-fi');
  });

  it('builds extra fields only when non-empty', () => {
    expect(dropFacetsExtraFields(['rock'], 'audio')).toEqual({
      facets: ['rock'],
    });
    expect(dropFacetsExtraFields([], 'audio')).toEqual({});
  });

  it('parses and infers audioFormat', () => {
    expect(parseAudioFormat('Album')).toBe('album');
    expect(parseAudioFormat('podcast')).toBe('podcast');
    expect(parseAudioFormat('lp')).toBeNull();
    expect(inferAudioFormatFromPlayableCount(1)).toBe('single');
    expect(inferAudioFormatFromPlayableCount(4)).toBe('album');
    expect(inferAudioFormatFromPlayableCount(0)).toBeNull();
  });
});
