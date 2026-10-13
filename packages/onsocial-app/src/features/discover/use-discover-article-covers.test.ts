import { describe, expect, it } from 'vitest';
import { discoverArticleCoverFromPost } from '@/features/discover/use-discover-article-covers';

describe('discoverArticleCoverFromPost', () => {
  it('uses the photo and the post time', () => {
    const cover = discoverArticleCoverFromPost({
      value: JSON.stringify({
        v: 1,
        text: 'Lisbon',
        media: ['https://cdn.example/night.jpg'],
        x: { onsocial: { article: { title: 'Night drive' } } },
      }),
      blockTimestamp: 1_700_000_000_000,
    });
    expect(cover.coverUrl).toBe('https://cdn.example/night.jpg');
    expect(cover.issuedAt).toBe(1_700_000_000_000);
  });

  it('keeps the default card when the essay has no photo', () => {
    const cover = discoverArticleCoverFromPost({
      value: JSON.stringify({
        v: 1,
        text: 'Lisbon',
        x: { onsocial: { article: { title: 'Night drive' } } },
      }),
      blockTimestamp: 'nope',
    });
    expect(cover.coverUrl).toBeNull();
    expect(cover.pinned).toBe(false);
    expect(cover.issuedAt).toBe(0);
  });
});