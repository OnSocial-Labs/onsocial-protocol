import { describe, expect, it } from 'vitest';
import {
  countHubPrimaryCategories,
  hubCategoryLabel,
  hubDiscoverCategoryFilters,
  parseHubCategory,
  parseHubCategories,
  hubCategoriesMetadataFields,
  HUB_MAX_CATEGORIES,
} from '@/features/scarces/hub-categories';

describe('hub categories', () => {
  it('allows a single category only', () => {
    expect(HUB_MAX_CATEGORIES).toBe(1);
  });

  it('parses freeform categories', () => {
    expect(parseHubCategory('music')).toBe('music');
    expect(parseHubCategory('Books')).toBe('books');
    expect(parseHubCategory('live-music')).toBe('live_music');
    expect(parseHubCategory('nope!')).toBe('nope');
    expect(parseHubCategory(null)).toBeNull();
  });

  it('reads categories[] only and keeps the first', () => {
    expect(
      parseHubCategories({
        categories: ['music', 'record'],
      })
    ).toEqual(['music']);
    expect(parseHubCategories({})).toEqual([]);
    expect(
      parseHubCategories({
        categories: ['!!!'],
      })
    ).toEqual([]);
  });

  it('writes a single category', () => {
    expect(hubCategoriesMetadataFields(['Music', 'Live Music'])).toEqual({
      categories: ['music'],
    });
  });

  it('labels known and custom categories', () => {
    expect(hubCategoryLabel('art')).toBe('Art');
    expect(hubCategoryLabel('events')).toBe('Events');
    expect(hubCategoryLabel('community')).toBe('Community');
    expect(hubCategoryLabel('live_music')).toBe('Live Music');
    expect(hubCategoryLabel(null)).toBeNull();
  });

  it('builds Discover chips from used curated categories only', () => {
    const counts = countHubPrimaryCategories([
      { category: 'music' },
      { category: 'music' },
      { category: 'books' },
      { category: 'custom_niche' },
      { category: null },
    ]);
    expect(hubDiscoverCategoryFilters(counts)).toEqual([
      { id: 'all', label: 'All' },
      { id: 'music', label: 'Music' },
      { id: 'books', label: 'Books' },
    ]);
  });

  it('omits the chip rail contents when nothing curated is used', () => {
    expect(
      hubDiscoverCategoryFilters(countHubPrimaryCategories([{ category: 'x' }]))
    ).toEqual([{ id: 'all', label: 'All' }]);
  });
});
