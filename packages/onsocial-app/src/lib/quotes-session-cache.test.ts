import { describe, expect, it, beforeEach } from 'vitest';
import type { PostRow } from '@onsocial/sdk';
import {
  clearQuotesSessionCache,
  readQuotesSession,
  seedQuotesFromSession,
  writeQuotesSession,
} from './quotes-session-cache';
import {
  clearThreadSessionCache,
  writeThreadSession,
} from './thread-session-cache';

function post(postId: string): PostRow {
  return {
    accountId: 'alice.near',
    postId,
    blockHeight: 1,
    blockTimestamp: 1,
    value: '{"text":"hi"}',
  } as PostRow;
}

describe('quotes session cache', () => {
  beforeEach(() => {
    clearQuotesSessionCache();
    clearThreadSessionCache();
  });

  it('reads back a dedicated quotes write', () => {
    writeQuotesSession('alice.near/post/1', {
      root: post('1'),
      quotes: [post('q1')],
      reposters: [],
      hasMoreQuotes: false,
      hasMoreReposters: false,
      engagement: {},
      scarceEmbeds: {},
    });
    const hit = readQuotesSession('alice.near/post/1');
    expect(hit?.quotes).toHaveLength(1);
    expect(hit?.root.postId).toBe('1');
  });

  it('seeds from thread session when quotes cache misses', () => {
    writeThreadSession('alice.near/post/1', {
      root: post('1'),
      replies: [],
      quotes: [post('q1'), post('q2')],
      replyTree: [],
      hasMoreReplies: false,
      engagement: {},
      scarceEmbeds: {},
    });
    const seed = seedQuotesFromSession({
      accountId: 'alice.near',
      postId: '1',
    });
    expect(seed?.quotes).toHaveLength(2);
    expect(seed?.reposters).toEqual([]);
  });

  it('seeds from an optional root when both caches miss', () => {
    const seed = seedQuotesFromSession({
      accountId: 'alice.near',
      postId: '1',
      root: post('1'),
      rootEngagement: {
        replyCount: 0,
        quoteCount: 2,
        repostCount: 0,
        reactionCount: 0,
        viewerReacted: false,
        amplifyCount: 0,
        viewerAmplified: false,
        viewerSaved: false,
        viewerReposted: false,
        viewerRepostId: null,
        viewerRepostGroupId: null,
        viewerFlagsReady: true,
        amplifyCountReady: true,
        reactionRoll: 0,
        amplifyRoll: 0,
        replyRoll: 0,
        shareRoll: 0,
      },
    });
    expect(seed?.root.postId).toBe('1');
    expect(seed?.quotes).toEqual([]);
    expect(seed?.engagement['alice.near:1']?.quoteCount).toBe(2);
  });

  it('prefers dedicated quotes over thread fallback', () => {
    writeThreadSession('alice.near/post/1', {
      root: post('1'),
      replies: [],
      quotes: [post('old')],
      replyTree: [],
      hasMoreReplies: false,
      engagement: {},
      scarceEmbeds: {},
    });
    writeQuotesSession('alice.near/post/1', {
      root: post('1'),
      quotes: [post('fresh')],
      reposters: [
        {
          accountId: 'bob.near',
          repostId: 'r1',
          blockTimestamp: 1,
        },
      ],
      hasMoreQuotes: false,
      hasMoreReposters: false,
      engagement: {},
      scarceEmbeds: {},
    });
    const seed = seedQuotesFromSession({
      accountId: 'alice.near',
      postId: '1',
    });
    expect(seed?.quotes[0]?.postId).toBe('fresh');
    expect(seed?.reposters).toHaveLength(1);
  });
});
