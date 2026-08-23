import { describe, expect, it } from 'vitest';
import {
  DROP_MAX_FACETS,
  dropFacetFieldLabel,
  dropFacetLabel,
  dropFacetsExtraFields,
  ensureGenerativeFacet,
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
    expect(
      normalizeDropFacets(['poetry', 'rock', 'fiction'], 'writing')
    ).toEqual(['poetry', 'fiction']);
  });

  it('keeps art / ticket / coupon / membership / custom vocabs', () => {
    expect(normalizeDropFacets(['generative', 'rock'], 'art')).toEqual([
      'generative',
    ]);
    expect(normalizeDropFacets(['nightlife', 'fiction'], 'ticket')).toEqual([
      'nightlife',
    ]);
    expect(normalizeDropFacets(['discount', 'jazz'], 'coupon')).toEqual([
      'discount',
    ]);
    expect(normalizeDropFacets(['patron', 'blues'], 'membership')).toEqual([
      'patron',
    ]);
    expect(normalizeDropFacets(['utility', 'rock'], 'custom')).toEqual([
      'utility',
    ]);
  });

  it('returns no facets for unsupported media', () => {
    expect(normalizeDropFacets(['rock'], 'video')).toEqual([]);
    expect(normalizeDropFacets(['fiction'], 'thought')).toEqual([]);
  });

  it('parses facets from extra with medium; null kind accepts custom themes', () => {
    expect(parseDropFacets({ facets: ['blues', 'soul'] }, 'audio')).toEqual([
      'blues',
      'soul',
    ]);
    expect(parseDropFacets({ facets: ['blues'] }, 'writing')).toEqual([]);
    expect(parseDropFacets({ facets: ['utility', 'rock'] }, null)).toEqual([
      'utility',
    ]);
  });

  it('labels known slugs and field titles', () => {
    expect(dropFacetLabel('hip-hop')).toBe('Hip-hop');
    expect(dropFacetLabel('scifi')).toBe('Sci-fi');
    expect(dropFacetLabel('generative')).toBe('Generative');
    expect(dropFacetFieldLabel('art')).toBe('Style');
    expect(dropFacetFieldLabel('ticket')).toBe('Occasion');
    expect(dropFacetFieldLabel('custom')).toBe('Theme');
  });

  it('builds extra fields only when non-empty', () => {
    expect(dropFacetsExtraFields(['rock'], 'audio')).toEqual({
      facets: ['rock'],
    });
    expect(dropFacetsExtraFields([], 'audio')).toEqual({});
  });

  it('stamps generative first and respects the facet cap', () => {
    expect(ensureGenerativeFacet([])).toEqual(['generative']);
    expect(ensureGenerativeFacet(['photo'])).toEqual(['generative', 'photo']);
    expect(ensureGenerativeFacet(['generative', 'photo'])).toEqual([
      'generative',
      'photo',
    ]);
    expect(ensureGenerativeFacet(['photo', '3d', 'paint'])).toEqual([
      'generative',
      'photo',
      '3d',
    ]);
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
