import type { GroupConversation } from '@onsocial/sdk';
import type { GuildMembershipOutcome } from '@/features/guilds/guild-membership-action';
import type { GuildViewerAccess } from '@/features/guilds/guild-structure';
import type { GuildPostPageData } from '@/lib/load-guild-post-page';

export type GuildThreadLoadState = 'loading' | 'ready' | 'missing' | 'error';
export type GuildThreadTab = 'replies' | 'quotes';

export const GUILD_THREAD_LOAD_ERROR = 'Could not load guild thread.';
export const GUILD_THREAD_LOAD_MORE_REPLIES_ERROR =
  'Could not load more replies.';
export const GUILD_THREAD_LOAD_MORE_QUOTES_ERROR =
  'Could not load more quotes.';

export const EMPTY_GUILD_THREAD_ACCESS: GuildViewerAccess = {
  isMember: false,
  isOwner: false,
  isAdmin: false,
  canModerate: false,
};

export type GuildThreadLoadMoreError = {
  tab: GuildThreadTab;
  message: string;
};

export type GuildThreadMembershipPatch = {
  isMember?: boolean;
  joinPending?: boolean;
  joinCancelReady?: boolean;
  pendingJoinProposalId?: string | null;
  clearViewerMembership?: boolean;
};

export function groupPostContentPath(
  postAuthor: string,
  groupId: string,
  targetPostId: string
): string {
  return `${postAuthor}/groups/${groupId}/content/post/${targetPostId}`;
}

export function conversationFromInitial(
  initial?: GuildPostPageData | null
): GroupConversation {
  return initial
    ? {
        root: initial.root,
        replies: initial.replies,
        quotes: initial.quotes,
      }
    : { root: null, replies: [], quotes: [] };
}

export function guildThreadLoadError(cause: unknown): string {
  return cause instanceof Error && cause.message.trim()
    ? cause.message
    : GUILD_THREAD_LOAD_ERROR;
}

export function guildThreadLoadMoreFallback(tab: GuildThreadTab): string {
  return tab === 'replies'
    ? GUILD_THREAD_LOAD_MORE_REPLIES_ERROR
    : GUILD_THREAD_LOAD_MORE_QUOTES_ERROR;
}

export function guildThreadLoadMoreError(
  tab: GuildThreadTab,
  cause: unknown
): GuildThreadLoadMoreError {
  const fallback = guildThreadLoadMoreFallback(tab);
  return {
    tab,
    message:
      cause instanceof Error && cause.message.trim()
        ? cause.message
        : fallback,
  };
}

export function nextGuildThreadMembership(
  outcome: GuildMembershipOutcome
): GuildThreadMembershipPatch {
  switch (outcome) {
    case 'left':
      return {
        isMember: false,
        joinPending: false,
        joinCancelReady: false,
        pendingJoinProposalId: null,
        clearViewerMembership: true,
      };
    case 'canceled':
      return {
        joinPending: false,
        joinCancelReady: false,
        pendingJoinProposalId: null,
      };
    case 'requested':
      return { joinPending: true, joinCancelReady: false };
    case 'joined':
      return { isMember: true, joinPending: false };
  }
}
