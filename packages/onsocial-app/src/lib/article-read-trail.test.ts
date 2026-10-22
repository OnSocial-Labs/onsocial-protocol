import { describe, expect, it } from 'vitest';
import type { PostRow } from '@onsocial/sdk';
import {
  articlePermalinkBack,
  popArticleTrail,
  pushArticleTrail,
} from './article-read-trail';

function post(postId: string): PostRow {
  return { accountId: 'alice.testnet', postId } as PostRow;
}

describe('article read trail', () => {
  it('keeps the next article in the same reader', () => {
    const trail = pushArticleTrail([post('night')], post('print'));
    expect(trail.map((row) => row.postId)).toEqual(['night', 'print']);
  });

  it('does not stack the article that is already open', () => {
    const root = [post('night')];
    expect(pushArticleTrail(root, post('night'))).toEqual(root);
  });

  it('returns to the screen that opened the article', () => {
    expect(
      articlePermalinkBack({ poppedTrail: true, historyLength: 4 })
    ).toBe('trail');
    expect(
      articlePermalinkBack({ poppedTrail: false, historyLength: 3 })
    ).toBe('history');
    expect(
      articlePermalinkBack({ poppedTrail: false, historyLength: 1 })
    ).toBe('shelf');
  });

  it('steps back to the previous article, then leaves the reader', () => {
    const trail = pushArticleTrail([post('night')], post('print'));
    expect(popArticleTrail(trail)?.map((row) => row.postId)).toEqual(['night']);
    expect(popArticleTrail([post('night')])).toBeNull();
  });
});
