import { beforeEach, describe, expect, it } from 'vitest';
import type { PostRow } from '@onsocial/sdk';
import type { PersonalPostPageData } from '@/lib/load-personal-post-page';
import {
  clearThreadSessionCache,
  readThreadSession,
  writeThreadSession,
} from './thread-session-cache';

function root(postId: string): PostRow {
  return {
    accountId: 'alice.near',
    postId,
    value: '',
    blockHeight: 1,
    blockTimestamp: 1,
  };
}

function data(postId: string): PersonalPostPageData {
  return {
    root: root(postId),
    replies: [],
    quotes: [],
    replyTree: [],
    hasMoreReplies: false,
    engagement: {},
    scarceEmbeds: {},
  };
}

describe('thread-session-cache', () => {
  beforeEach(() => {
    clearThreadSessionCache();
  });

  it('returns null for a thread never fetched', () => {
    expect(readThreadSession('alice.near/post/x')).toBeNull();
  });

  it('round-trips a written snapshot with a fetchedAt stamp', () => {
    writeThreadSession('alice.near/post/x', data('x'));
    const hit = readThreadSession('alice.near/post/x');
    expect(hit?.root.postId).toBe('x');
    expect(typeof hit?.fetchedAt).toBe('number');
  });

  it('overwrites an existing entry', () => {
    writeThreadSession('alice.near/post/x', data('x'));
    writeThreadSession('alice.near/post/x', {
      ...data('x'),
      hasMoreReplies: true,
    });
    expect(readThreadSession('alice.near/post/x')?.hasMoreReplies).toBe(true);
  });

  it('evicts the least recently touched thread past the cap', () => {
    for (let index = 0; index < 16; index += 1) {
      writeThreadSession(`alice.near/post/p${index}`, data(`p${index}`));
    }
    expect(readThreadSession('alice.near/post/p0')).toBeNull();
    expect(readThreadSession('alice.near/post/p15')).not.toBeNull();
  });

  it('a read refreshes recency, keeping the entry alive', () => {
    for (let index = 0; index < 15; index += 1) {
      writeThreadSession(`alice.near/post/p${index}`, data(`p${index}`));
    }
    expect(readThreadSession('alice.near/post/p0')).not.toBeNull();
    writeThreadSession('alice.near/post/new', data('new'));
    expect(readThreadSession('alice.near/post/p0')).not.toBeNull();
    expect(readThreadSession('alice.near/post/p1')).toBeNull();
  });
});
