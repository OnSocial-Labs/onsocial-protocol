import { describe, expect, it } from 'vitest';
import type { GuildPostPageData } from '@/lib/load-guild-post-page';
import {
  conversationFromInitial,
  EMPTY_GUILD_THREAD_ACCESS,
  groupPostContentPath,
  GUILD_THREAD_LOAD_ERROR,
  GUILD_THREAD_LOAD_MORE_QUOTES_ERROR,
  GUILD_THREAD_LOAD_MORE_REPLIES_ERROR,
  guildThreadLoadError,
  guildThreadLoadMoreError,
  guildThreadLoadMoreFallback,
  nextGuildThreadMembership,
} from '@/features/guilds/guild-thread-data';

const initialThread = {
  root: { postId: 'root-1' },
  replies: [{ postId: 'reply-1' }],
  quotes: [{ postId: 'quote-1' }],
  replyTree: [],
  hasMoreReplies: true,
  hasMoreQuotes: false,
  guildName: 'Audit Guild',
  memberDriven: false,
  accessGated: false,
} as unknown as GuildPostPageData;

describe('groupPostContentPath', () => {
  it('builds the indexed group post path', () => {
    expect(groupPostContentPath('alice.near', 'audit-guild', '42')).toBe(
      'alice.near/groups/audit-guild/content/post/42'
    );
  });
});

describe('conversationFromInitial', () => {
  it('seeds the painted SSR conversation and stays empty without it', () => {
    expect(conversationFromInitial(initialThread)).toEqual({
      root: initialThread.root,
      replies: initialThread.replies,
      quotes: initialThread.quotes,
    });
    expect(conversationFromInitial(null)).toEqual({
      root: null,
      replies: [],
      quotes: [],
    });
  });
});

describe('guildThreadLoadError', () => {
  it('keeps a typed error and falls back when the thread fails', () => {
    expect(guildThreadLoadError(new Error('Indexer timed out.'))).toBe(
      'Indexer timed out.'
    );
    expect(guildThreadLoadError('nope')).toBe(GUILD_THREAD_LOAD_ERROR);
    expect(guildThreadLoadError(new Error('   '))).toBe(GUILD_THREAD_LOAD_ERROR);
  });
});

describe('guildThreadLoadMoreError', () => {
  it('keeps a typed error and names the failed tab', () => {
    expect(
      guildThreadLoadMoreError('replies', new Error('Reply page timed out.'))
    ).toEqual({
      tab: 'replies',
      message: 'Reply page timed out.',
    });
    expect(guildThreadLoadMoreError('quotes', 'nope')).toEqual({
      tab: 'quotes',
      message: GUILD_THREAD_LOAD_MORE_QUOTES_ERROR,
    });
    expect(guildThreadLoadMoreFallback('replies')).toBe(
      GUILD_THREAD_LOAD_MORE_REPLIES_ERROR
    );
  });
});

describe('nextGuildThreadMembership', () => {
  it('patches join, leave, cancel, and request without touching unread ACL', () => {
    expect(nextGuildThreadMembership('left')).toEqual({
      isMember: false,
      joinPending: false,
      joinCancelReady: false,
      pendingJoinProposalId: null,
      clearViewerMembership: true,
    });
    expect(nextGuildThreadMembership('canceled')).toEqual({
      joinPending: false,
      joinCancelReady: false,
      pendingJoinProposalId: null,
    });
    expect(nextGuildThreadMembership('requested')).toEqual({
      joinPending: true,
      joinCancelReady: false,
    });
    expect(nextGuildThreadMembership('joined')).toEqual({
      isMember: true,
      joinPending: false,
    });
  });
});

describe('EMPTY_GUILD_THREAD_ACCESS', () => {
  it('starts guests with no write or moderate rights', () => {
    expect(EMPTY_GUILD_THREAD_ACCESS).toEqual({
      isMember: false,
      isOwner: false,
      isAdmin: false,
      canModerate: false,
    });
  });
});
