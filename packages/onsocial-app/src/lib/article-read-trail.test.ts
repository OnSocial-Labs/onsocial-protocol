import { describe, expect, it } from 'vitest';
import type { PostRow } from '@onsocial/sdk';
import { popArticleTrail, pushArticleTrail } from './article-read-trail';

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

  it('steps back to the previous article, then leaves the reader', () => {
    const trail = pushArticleTrail([post('night')], post('print'));
    expect(popArticleTrail(trail)?.map((row) => row.postId)).toEqual(['night']);
    expect(popArticleTrail([post('night')])).toBeNull();
  });
});
