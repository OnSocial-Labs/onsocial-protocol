import { describe, expect, it } from 'vitest';
import {
  hubCategoryLabel,
  parseHubCategory,
} from '@/features/scarces/hub-categories';

describe('hub categories', () => {
  it('parses known categories', () => {
    expect(parseHubCategory('music')).toBe('music');
    expect(parseHubCategory('Books')).toBe('books');
    expect(parseHubCategory('nope')).toBeNull();
    expect(parseHubCategory(null)).toBeNull();
  });

  it('labels categories', () => {
    expect(hubCategoryLabel('art')).toBe('Art');
    expect(hubCategoryLabel(null)).toBeNull();
  });
});
