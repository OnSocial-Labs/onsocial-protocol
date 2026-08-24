import { describe, expect, it } from 'vitest';
import type { PostRow } from '@onsocial/sdk';
import {
  isQuoteRefType,
  isRepostRefType,
  postRelationContext,
  resolveQuotedInset,
  withRepostOriginals,
  formatPostRelationTarget,
  relationTargetAccountIdFromPost,
  collectRelationTargetAccountIds,
} from '@/lib/post-relation';

function post(over: Partial<PostRow> = {}): PostRow {
  return {
    accountId: 'alice.near',
    postId: '1',
    value: '{"v":1,"text":"hi"}',
    blockHeight: 1,
    blockTimestamp: 1,
    ...over,
  };
}

describe('isRepostRefType', () => {
  it('matches repost case-insensitively', () => {
    expect(isRepostRefType('repost')).toBe(true);
    expect(isRepostRefType('Repost')).toBe(true);
    expect(isRepostRefType('quote')).toBe(false);
    expect(isRepostRefType('post')).toBe(false);
    expect(isRepostRefType(undefined)).toBe(false);
  });
});

describe('isQuoteRefType', () => {
  it('matches quote and cite', () => {
    expect(isQuoteRefType('quote')).toBe(true);
    expect(isQuoteRefType('Cite')).toBe(true);
    expect(isQuoteRefType('repost')).toBe(false);
    expect(isQuoteRefType('post')).toBe(false);
    expect(isQuoteRefType(undefined)).toBe(false);
  });
});

describe('postRelationContext', () => {
  it('prefers reply over repost ref', () => {
    expect(
      postRelationContext({
        parentPath: 'bob.near/post/2',
        parentAuthor: 'bob.near',
        refPath: 'carol.near/post/3',
        refType: 'repost',
      })
    ).toEqual({ kind: 'reply', verb: 'Replying to', handle: 'bob.near' });
  });

  it('attributes a share to you, not the original handle', () => {
    expect(
      postRelationContext(
        {
          accountId: 'alice.near',
          refPath: 'bob.near/post/2',
          refType: 'repost',
        },
        { viewerAccountId: 'alice.near', authorName: 'Alice' }
      )
    ).toEqual({ kind: 'repost', label: 'You reposted' });
  });

  it('attributes someone else’s share by their name', () => {
    expect(
      postRelationContext(
        {
          accountId: 'alice.near',
          refPath: 'bob.near/post/2',
          refType: 'repost',
        },
        { viewerAccountId: 'carol.near', authorName: 'Alice' }
      )
    ).toEqual({ kind: 'repost', label: 'Alice reposted' });
  });

  it('falls back to the reposter account id when no display name', () => {
    expect(
      postRelationContext({
        accountId: 'alice.near',
        refPath: 'bob.near/post/2',
        refType: 'repost',
      })
    ).toEqual({ kind: 'repost', label: 'alice.near reposted' });
  });

  it('never shows a quote relation — the inset card carries context', () => {
    expect(
      postRelationContext({
        refPath: 'bob.near/post/2',
        refType: 'quote',
      })
    ).toBeNull();
  });

  it('suppresses self-replies', () => {
    expect(
      postRelationContext({
        accountId: 'test03.onsocial.testnet',
        parentPath: 'test03.onsocial.testnet/post/1',
        parentAuthor: 'test03.onsocial.testnet',
      })
    ).toBeNull();
  });
});

describe('formatPostRelationTarget', () => {
  it('includes name and handle when profile is known', () => {
    expect(formatPostRelationTarget('bob.near', 'Bob')).toEqual({
      name: 'Bob',
      handle: 'bob.near',
      label: 'Bob @bob.near',
    });
  });

  it('falls back to handle only', () => {
    expect(formatPostRelationTarget('bob.near')).toEqual({
      name: null,
      handle: 'bob.near',
      label: '@bob.near',
    });
  });
});

describe('relationTargetAccountIdFromPost', () => {
  it('returns reply target', () => {
    expect(
      relationTargetAccountIdFromPost({
        accountId: 'alice.near',
        parentPath: 'bob.near/post/2',
        parentAuthor: 'bob.near',
      })
    ).toBe('bob.near');
  });

  it('returns null for self-replies', () => {
    expect(
      relationTargetAccountIdFromPost({
        accountId: 'alice.near',
        parentPath: 'alice.near/post/2',
        parentAuthor: 'alice.near',
      })
    ).toBeNull();
  });
});

describe('collectRelationTargetAccountIds', () => {
  it('dedupes reply targets across posts', () => {
    expect(
      collectRelationTargetAccountIds([
        post({
          parentPath: 'bob.near/post/1',
          parentAuthor: 'bob.near',
        }),
        post({
          parentPath: 'bob.near/post/2',
          parentAuthor: 'bob.near',
        }),
      ])
    ).toEqual(['bob.near']);
  });
});

describe('withRepostOriginals', () => {
  const shell = post({
    accountId: 'alice.near',
    postId: 'shell',
    refPath: 'bob.near/post/2',
    refType: 'repost',
  });
  const original = post({ accountId: 'bob.near', postId: '2' });

  it('appends resolved repost originals', () => {
    expect(
      withRepostOriginals([shell], { 'bob.near/post/2': original })
    ).toEqual([shell, original]);
  });

  it('skips unresolved originals and non-reposts', () => {
    const plain = post({ postId: '9' });
    expect(withRepostOriginals([shell, plain], {})).toEqual([shell, plain]);
  });

  it('does not duplicate an original already in the feed', () => {
    const result = withRepostOriginals([shell, original], {
      'bob.near/post/2': original,
    });
    expect(result).toEqual([shell, original]);
  });
});

describe('resolveQuotedInset', () => {
  const root = post({ accountId: 'root.near', postId: 'root' });
  const reply = post({ accountId: 'reply.near', postId: 'reply' });

  it('uses the resolved refPath, not the thread root', () => {
    expect(
      resolveQuotedInset(
        { refPath: 'reply.near/post/reply' },
        { 'reply.near/post/reply': reply },
        root
      )
    ).toBe(reply);
  });

  it('falls back to the root only when refPath is the root', () => {
    expect(
      resolveQuotedInset({ refPath: 'root.near/post/root' }, {}, root)
    ).toBe(root);
  });

  it('does not show the root while a different refPath is still loading', () => {
    expect(
      resolveQuotedInset({ refPath: 'reply.near/post/reply' }, {}, root)
    ).toBeUndefined();
  });
});
