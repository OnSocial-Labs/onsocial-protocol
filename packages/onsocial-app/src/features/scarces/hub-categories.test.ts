import { describe, expect, it } from 'vitest';
import {
  hubCategoryLabel,
  parseHubCategory,
  parseHubCategories,
  hubCategoriesMetadataFields,
  hubDiscoverCategoryFilters,
  countHubPrimaryCategories,
  HUB_MAX_CATEGORIES,
} from '@/features/scarces/hub-categories';

describe('hub categories', () => {
  it('keeps two categories max', () => {
    expect(HUB_MAX_CATEGORIES).toBe(2);
  });

  it('parses freeform categories', () => {
    expect(parseHubCategory('music')).toBe('music');
    expect(parseHubCategory('Books')).toBe('books');
    expect(parseHubCategory('live-music')).toBe('live_music');
    expect(parseHubCategory('nope!')).toBe('nope');
    expect(parseHubCategory(null)).toBeNull();
  });

  it('reads categories[] only', () => {
    expect(
      parseHubCategories({
        categories: ['music', 'record'],
      })
    ).toEqual(['music', 'record']);
    expect(parseHubCategories({})).toEqual([]);
    expect(
      parseHubCategories({
        categories: ['!!!'],
      })
    ).toEqual([]);
  });

  it('writes categories only (primary is categories[0])', () => {
    expect(hubCategoriesMetadataFields(['Music', 'Live Music'])).toEqual({
      categories: ['music', 'live_music'],
    });
  });

  it('labels known and custom categories', () => {
    expect(hubCategoryLabel('art')).toBe('Art');
    expect(hubCategoryLabel('events')).toBe('Events');
    expect(hubCategoryLabel('crypto')).toBe('Crypto');
    expect(hubCategoryLabel('live_music')).toBe('Live music');
    expect(hubCategoryLabel(null)).toBeNull();
  });

  it('builds Discover chips from used categories; customs need 2+', () => {
    expect(
      hubDiscoverCategoryFilters(
        countHubPrimaryCategories([
          { category: 'music' },
          { category: 'podcasts' },
          { category: 'podcasts' },
          { category: 'once' },
          { category: null },
        ])
      )
    ).toEqual([
      { id: 'all', label: 'All' },
      { id: 'podcasts', label: 'Podcasts' },
      { id: 'music', label: 'Music' },
    ]);
  });
});
