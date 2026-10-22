import { describe, expect, it } from 'vitest';
import {
  resolvePortfolioRailItems,
  resolvePortfolioRailTab,
} from '@/components/portfolio/profile-feed-tabs';

const empty = { scarces: false, collection: false };
const held = { scarces: false, collection: true };

describe('portfolio rail tab while Collectibles loads', () => {
  it('keeps Collectibles until the holdings list is known', () => {
    expect(resolvePortfolioRailTab('collection', empty, true)).toBe(
      'collection'
    );
    expect(
      resolvePortfolioRailItems(empty, 'collection').map((item) => item.id)
    ).toContain('collection');
  });

  it('falls back to Posts once Collectibles is known empty', () => {
    expect(resolvePortfolioRailTab('collection', empty, false)).toBe('posts');
    expect(
      resolvePortfolioRailItems(empty).map((item) => item.id)
    ).not.toContain('collection');
  });

  it('keeps Collectibles when the list is already there', () => {
    expect(resolvePortfolioRailTab('collection', held, false)).toBe(
      'collection'
    );
  });

  it('leaves a feed tab alone', () => {
    expect(resolvePortfolioRailTab('replies', empty, true)).toBe('replies');
  });
});
