import { describe, expect, it } from 'vitest';
import {
  hubCategoryLabel,
  parseHubCategory,
  parseHubTopics,
  hubTopicsMetadataFields,
} from '@/features/scarces/hub-categories';

describe('hub categories / topics', () => {
  it('parses freeform categories', () => {
    expect(parseHubCategory('music')).toBe('music');
    expect(parseHubCategory('Books')).toBe('books');
    expect(parseHubCategory('live-music')).toBe('live_music');
    expect(parseHubCategory('nope!')).toBe('nope');
    expect(parseHubCategory(null)).toBeNull();
  });

  it('falls back to category when topics is empty', () => {
    expect(parseHubTopics({ topics: [], category: 'Film' })).toEqual(['film']);
    expect(parseHubTopics({ topics: ['!!!'], category: 'art' })).toEqual([
      'art',
    ]);
  });

  it('writes topics + legacy category primary', () => {
    expect(hubTopicsMetadataFields(['Music', 'Live Music'])).toEqual({
      topics: ['music', 'live_music'],
      category: 'music',
    });
  });

  it('labels known and custom topics', () => {
    expect(hubCategoryLabel('art')).toBe('Art');
    expect(hubCategoryLabel('live_music')).toBe('Live Music');
    expect(hubCategoryLabel(null)).toBeNull();
  });
});
