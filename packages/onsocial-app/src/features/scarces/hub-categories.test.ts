import { describe, expect, it } from 'vitest';
import {
  hubCategoryLabel,
  parseHubCategory,
  parseHubCategories,
  hubCategoriesMetadataFields,
} from '@/features/scarces/hub-categories';

describe('hub categories', () => {
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
    expect(hubCategoryLabel('live_music')).toBe('Live Music');
    expect(hubCategoryLabel(null)).toBeNull();
  });
});
