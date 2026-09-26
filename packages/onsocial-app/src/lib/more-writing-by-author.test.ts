import { describe, expect, it } from 'vitest';
import { moreWritingByAuthor } from '@/lib/more-writing-by-author';

function piece(postId: string, accountId = 'alice.near') {
  return { accountId, postId };
}

describe('moreWritingByAuthor', () => {
  it('skips the open piece and keeps newest-first order', () => {
    const articles = [piece('new'), piece('open'), piece('mid'), piece('old')];
    expect(moreWritingByAuthor(articles, piece('open'))).toEqual({
      items: [piece('new'), piece('mid'), piece('old')],
      hasMore: false,
    });
  });

  it('shows three and a shelf link when more remain', () => {
    const articles = ['a', 'b', 'c', 'd', 'e'].map((postId) => piece(postId));
    const result = moreWritingByAuthor(articles, piece('a'));
    expect(result.items.map((post) => post.postId)).toEqual(['b', 'c', 'd']);
    expect(result.hasMore).toBe(true);
  });

  it('hides the section when this author has nothing else', () => {
    expect(moreWritingByAuthor([piece('only')], piece('only'))).toEqual({
      items: [],
      hasMore: false,
    });
    expect(moreWritingByAuthor([], piece('only')).items).toEqual([]);
  });

  it('does not recommend another account', () => {
    const articles = [piece('theirs', 'bob.near'), piece('mine')];
    expect(moreWritingByAuthor(articles, piece('mine')).items).toEqual([]);
  });
});
