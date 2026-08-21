import { describe, expect, it } from 'vitest';
import {
  homePlacePath,
  normalizePlaceList,
  normalizePlaceSlug,
  placeLabel,
  placesMetaFromComposer,
} from '@/lib/post-place';

describe('post-place', () => {
  it('normalizes city / event labels into slugs', () => {
    expect(normalizePlaceSlug('Lisbon')).toBe('lisbon');
    expect(normalizePlaceSlug('ETH Denver')).toBe('eth_denver');
    expect(normalizePlaceSlug('#Tokyo')).toBe('tokyo');
    expect(normalizePlaceSlug('!!!')).toBeNull();
  });

  it('caps places per post for composer meta', () => {
    expect(normalizePlaceList(['Lisbon', 'Tokyo', 'Berlin'])).toEqual([
      'lisbon',
    ]);
    expect(placesMetaFromComposer('ETH Denver')).toEqual({
      places: ['eth_denver'],
    });
    expect(placesMetaFromComposer('')).toEqual({});
  });

  it('builds home place paths and labels', () => {
    expect(homePlacePath('Lisbon')).toBe('/home?place=lisbon');
    expect(placeLabel('eth_denver')).toBe('Eth denver');
  });
});
