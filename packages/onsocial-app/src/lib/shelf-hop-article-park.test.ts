import { afterEach, describe, expect, it } from 'vitest';
import type { PostRow } from '@onsocial/sdk';
import {
  clearParkedShelfHopArticle,
  getParkedShelfHopArticle,
  parkShelfHopArticle,
} from '@/lib/shelf-hop-article-park';

const post = {
  accountId: 'alice.near',
  postId: 'night-piece',
} as PostRow;

afterEach(() => {
  clearParkedShelfHopArticle();
});

describe('shelf hop article park', () => {
  it('keeps the open reader while Writing covers the feed slot', () => {
    parkShelfHopArticle({
      post,
      titleLabel: 'Alice',
      avatarUrl: null,
    });
    expect(getParkedShelfHopArticle()?.post.postId).toBe('night-piece');
    clearParkedShelfHopArticle();
    expect(getParkedShelfHopArticle()).toBeNull();
  });
});
