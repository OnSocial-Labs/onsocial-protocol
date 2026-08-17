import { describe, expect, it } from 'vitest';
import { parseSaveContentPath } from '@/lib/save-content-path';

describe('parseSaveContentPath', () => {
  it('parses personal post paths', () => {
    expect(parseSaveContentPath('alice.near/post/42')).toEqual({
      author: 'alice.near',
      postId: '42',
    });
  });

  it('parses guild post paths', () => {
    expect(
      parseSaveContentPath('alice.near/groups/dao.near/content/post/7')
    ).toEqual({
      author: 'alice.near',
      postId: '7',
    });
  });

  it('strips full on-chain saved paths', () => {
    expect(
      parseSaveContentPath('viewer.near/saved/alice.near/post/42')
    ).toEqual({
      author: 'alice.near',
      postId: '42',
    });
    expect(
      parseSaveContentPath(
        'viewer.near/saved/alice.near/groups/dao.near/content/post/7'
      )
    ).toEqual({
      author: 'alice.near',
      postId: '7',
    });
  });

  it('strips relative saved/ prefixes', () => {
    expect(parseSaveContentPath('saved/alice.near/post/42')).toEqual({
      author: 'alice.near',
      postId: '42',
    });
  });

  it('rejects empty / malformed paths', () => {
    expect(parseSaveContentPath('')).toBeNull();
    expect(parseSaveContentPath('alice.near')).toBeNull();
    expect(parseSaveContentPath('alice.near/posts/1')).toBeNull();
  });
});
