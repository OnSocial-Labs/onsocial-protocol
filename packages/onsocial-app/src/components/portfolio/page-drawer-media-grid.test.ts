import { describe, expect, it } from 'vitest';
import type { PostRow } from '@onsocial/sdk';
import {
  PROFILE_MEDIA_PAGE_SIZE,
  profileMediaAdvance,
  profileMediaCovers,
} from '@/components/portfolio/page-drawer-media-grid';

function row(postId: string, value: string): PostRow {
  return {
    accountId: 'alice.testnet',
    postId,
    value,
    blockHeight: 1,
    blockTimestamp: 1,
  };
}

describe('profileMediaAdvance', () => {
  it('steps forward while a page is full and new', () => {
    expect(
      profileMediaAdvance({
        offset: 0,
        pageSize: PROFILE_MEDIA_PAGE_SIZE,
        itemCount: PROFILE_MEDIA_PAGE_SIZE,
        addedCount: 40,
      })
    ).toEqual({ offset: PROFILE_MEDIA_PAGE_SIZE, hasMore: true });
  });

  it('stops on a short page and on a repeated window', () => {
    expect(
      profileMediaAdvance({
        offset: 72,
        pageSize: 72,
        itemCount: 12,
        addedCount: 12,
      })
    ).toEqual({ offset: 72, hasMore: false });
    expect(
      profileMediaAdvance({
        offset: 144,
        pageSize: 72,
        itemCount: 72,
        addedCount: 0,
      })
    ).toEqual({ offset: 144, hasMore: false });
  });
});

describe('profileMediaCovers', () => {
  it('keeps one cover per post and opens the post', () => {
    const covers = profileMediaCovers([
      row(
        'photo',
        JSON.stringify({
          text: 'Evening light on the river',
          media: [
            { cid: 'https://cdn.example/a.jpg', mime: 'image/jpeg' },
            { cid: 'https://cdn.example/b.jpg', mime: 'image/jpeg' },
          ],
        })
      ),
      row('plain', JSON.stringify({ text: 'No picture' })),
      row(
        'clip',
        JSON.stringify({
          media: [{ cid: 'https://cdn.example/c.mp4', mime: 'video/mp4' }],
        })
      ),
    ]);

    expect(covers).toEqual([
      {
        key: 'alice.testnet:photo',
        href: '/@alice.testnet/posts/photo',
        title: 'Evening light on the river',
        kind: 'Photo',
        coverUrl: 'https://cdn.example/a.jpg',
        count: 2,
      },
      {
        key: 'alice.testnet:clip',
        href: '/@alice.testnet/posts/clip',
        title: 'Video',
        kind: 'Video',
        coverUrl: 'https://cdn.example/c.mp4',
        count: 1,
      },
    ]);
  });

  it('opens a titled article on the piece', () => {
    const covers = profileMediaCovers([
      row(
        'essay',
        JSON.stringify({
          text: 'A longer piece',
          media: [{ cid: 'https://cdn.example/cover.jpg', mime: 'image/jpeg' }],
          x: { onsocial: { article: { title: 'Field notes' } } },
        })
      ),
    ]);

    expect(covers[0]?.href).toBe('/@alice.testnet/writing/essay');
    expect(covers[0]?.title).toBe('Field notes');
  });
});
