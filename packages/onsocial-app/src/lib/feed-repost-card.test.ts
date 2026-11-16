import { describe, expect, it } from 'vitest';
import type { PostRow } from '@onsocial/sdk';
import {
  isBareRepostShell,
  resolveFeedRepostCard,
} from '@/lib/feed-repost-card';

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

describe('isBareRepostShell', () => {
  it('requires repost ref, empty body, and a refPath', () => {
    expect(
      isBareRepostShell({
        refType: 'repost',
        value: '{"v":1,"text":""}',
        refPath: 'bob.near/post/9',
      })
    ).toBe(true);
    expect(
      isBareRepostShell({
        refType: 'repost',
        value: '{"v":1,"text":"note"}',
        refPath: 'bob.near/post/9',
      })
    ).toBe(false);
    expect(
      isBareRepostShell({
        refType: 'quote',
        value: '{"v":1,"text":""}',
        refPath: 'bob.near/post/9',
      })
    ).toBe(false);
  });
});

describe('resolveFeedRepostCard', () => {
  it('holds pending until the original soft-fills', () => {
    const shell = post({
      accountId: 'carol.near',
      postId: '2',
      refType: 'repost',
      value: '{"v":1,"text":""}',
      refPath: 'bob.near/post/9',
    });
    expect(resolveFeedRepostCard(shell, {}, {}).pending).toBe(true);
  });

  it('paints the original as the card with repost attribution', () => {
    const original = post({
      accountId: 'bob.near',
      postId: '9',
      value: '{"v":1,"text":"original"}',
    });
    const shell = post({
      accountId: 'carol.near',
      postId: '2',
      refType: 'repost',
      value: '{"v":1,"text":""}',
      refPath: 'bob.near/post/9',
    });
    const resolved = resolveFeedRepostCard(
      shell,
      { 'bob.near/post/9': original },
      { 'carol.near': { displayName: 'Carol' } }
    );
    expect(resolved.pending).toBe(false);
    expect(resolved.card).toBe(original);
    expect(resolved.repostedBy).toEqual({
      accountId: 'carol.near',
      displayName: 'Carol',
    });
  });

  it('keeps quote cards as the citing post with an inset', () => {
    const original = post({
      accountId: 'bob.near',
      postId: '9',
      value: '{"v":1,"text":"original"}',
    });
    const quote = post({
      accountId: 'carol.near',
      postId: '3',
      refType: 'quote',
      value: '{"v":1,"text":"saying"}',
      refPath: 'bob.near/post/9',
    });
    const resolved = resolveFeedRepostCard(quote, {
      'bob.near/post/9': original,
    });
    expect(resolved.pending).toBe(false);
    expect(resolved.card).toBe(quote);
    expect(resolved.quoted).toBe(original);
    expect(resolved.repostedBy).toBeUndefined();
  });
});
