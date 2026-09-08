'use client';

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from 'react';
import type { GroupConversation, PostRow, ThreadNode } from '@onsocial/sdk';
import type { GuildMembershipOutcome } from '@/features/guilds/guild-membership-action';
import {
  conversationFromInitial,
  EMPTY_GUILD_THREAD_ACCESS,
  groupPostContentPath,
  guildThreadLoadError,
  guildThreadLoadMoreError,
  nextGuildThreadMembership,
  type GuildThreadLoadMoreError,
  type GuildThreadLoadState,
  type GuildThreadTab,
} from '@/features/guilds/guild-thread-data';
import {
  parseGuildStructure,
  type GuildStructureDocument,
  type GuildViewerAccess,
} from '@/features/guilds/guild-structure';
import { resolveViewerAllowlistSpaceIds } from '@/features/guilds/guild-space-write';
import { resolveGuildViewerAccess } from '@/features/guilds/guild-viewer-access';
import { createReadOnlyOnSocialClient } from '@/lib/create-readonly-onsocial-client';
import { writeGuildMembershipCache } from '@/lib/guild-membership-cache';
import type { GuildPostPageData } from '@/lib/load-guild-post-page';
import {
  THREAD_QUOTE_PAGE_SIZE,
  THREAD_REPLY_PAGE_SIZE,
  THREAD_REPLY_TREE_DEPTH,
  THREAD_REPLY_TREE_MAX_NODES,
} from '@/lib/load-personal-post-page';
import {
  flattenTreePosts,
  leafThreadNode,
  withoutIndexedPosts,
} from '@/lib/thread-display';

export type {
  GuildThreadLoadMoreError,
  GuildThreadLoadState,
  GuildThreadTab,
} from '@/features/guilds/guild-thread-data';
export {
  GUILD_THREAD_LOAD_ERROR,
  GUILD_THREAD_LOAD_MORE_QUOTES_ERROR,
  GUILD_THREAD_LOAD_MORE_REPLIES_ERROR,
  groupPostContentPath,
  guildThreadLoadMoreFallback,
} from '@/features/guilds/guild-thread-data';

const REPLY_PAGE_SIZE = THREAD_REPLY_PAGE_SIZE;
const QUOTE_PAGE_SIZE = THREAD_QUOTE_PAGE_SIZE;
const REPLY_TREE_DEPTH = THREAD_REPLY_TREE_DEPTH;
const REPLY_TREE_MAX_NODES = THREAD_REPLY_TREE_MAX_NODES;
const RECONCILE_DELAYS_MS = [2_000, 5_000];

/**
 * Conversation, structure, and ACL for a guild thread.
 * Callers own compose, sheets, and membership mutations.
 */
export function useGuildThreadData({
  groupId,
  author,
  postId,
  initial = null,
  accountId,
  walletLoading,
}: {
  groupId: string;
  author: string;
  postId: string;
  initial?: GuildPostPageData | null;
  accountId: string | null;
  walletLoading: boolean;
}): {
  loadState: GuildThreadLoadState;
  error: string | null;
  conversation: GroupConversation;
  replyTree: ThreadNode[];
  localReplies: PostRow[];
  setLocalReplies: Dispatch<SetStateAction<PostRow[]>>;
  localQuotes: PostRow[];
  setLocalQuotes: Dispatch<SetStateAction<PostRow[]>>;
  guildStructure: GuildStructureDocument | null;
  guildName: string | null;
  viewerAccess: GuildViewerAccess;
  isMember: boolean;
  isBlacklisted: boolean;
  accessGated: boolean;
  memberDriven: boolean;
  joinPending: boolean;
  joinCancelReady: boolean;
  pendingJoinProposalId: string | null;
  viewerAccessResolved: boolean;
  hasMoreReplies: boolean;
  hasMoreQuotes: boolean;
  loadingMore: boolean;
  loadMoreError: GuildThreadLoadMoreError | null;
  rootPath: string;
  refresh: (options?: { background?: boolean }) => Promise<void>;
  loadMore: (tab: GuildThreadTab) => void;
  scheduleReconcile: () => void;
  applyMembershipOutcome: (outcome: GuildMembershipOutcome) => void;
} {
  const threadKey = `${groupId}/${author}/${postId}`;
  const threadKeyRef = useRef(threadKey);
  threadKeyRef.current = threadKey;
  const [loadState, setLoadState] = useState<GuildThreadLoadState>(() =>
    initial ? 'ready' : 'loading'
  );
  const [conversation, setConversation] = useState<GroupConversation>(() =>
    conversationFromInitial(initial)
  );
  const [replyTree, setReplyTree] = useState<ThreadNode[]>(
    () => initial?.replyTree ?? []
  );
  const [localReplies, setLocalReplies] = useState<PostRow[]>([]);
  const [localQuotes, setLocalQuotes] = useState<PostRow[]>([]);
  const [guildStructure, setGuildStructure] =
    useState<GuildStructureDocument | null>(null);
  const [guildName, setGuildName] = useState<string | null>(
    () => initial?.guildName ?? null
  );
  const [viewerAccess, setViewerAccess] = useState<GuildViewerAccess>(
    EMPTY_GUILD_THREAD_ACCESS
  );
  const [isMember, setIsMember] = useState(false);
  const [isBlacklisted, setIsBlacklisted] = useState(false);
  const [accessGated, setAccessGated] = useState(
    () => initial?.accessGated ?? false
  );
  const [memberDriven, setMemberDriven] = useState(
    () => initial?.memberDriven ?? false
  );
  const [joinPending, setJoinPending] = useState(false);
  const [joinCancelReady, setJoinCancelReady] = useState(false);
  const [pendingJoinProposalId, setPendingJoinProposalId] = useState<
    string | null
  >(null);
  const [viewerAccessResolved, setViewerAccessResolved] = useState(false);
  const [hasMoreReplies, setHasMoreReplies] = useState(
    () => initial?.hasMoreReplies ?? false
  );
  const [hasMoreQuotes, setHasMoreQuotes] = useState(
    () => initial?.hasMoreQuotes ?? false
  );
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadMoreError, setLoadMoreError] =
    useState<GuildThreadLoadMoreError | null>(null);
  const [error, setError] = useState<string | null>(null);
  const paginatedRef = useRef(false);
  const reconcileTimersRef = useRef<number[]>([]);
  const ssrSeedRef = useRef(Boolean(initial));
  const loadMoreInFlightRef = useRef(false);
  const refreshRequestIdRef = useRef(0);

  const rootPath = groupPostContentPath(author, groupId, postId);

  const refresh = useCallback(
    async (options: { background?: boolean } = {}) => {
      const requestId = ++refreshRequestIdRef.current;
      if (!options.background) {
        setLoadState('loading');
        setError(null);
      }

      try {
        const client = createReadOnlyOnSocialClient();
        const postRef = { author, groupId, postId };
        const [rootResult, quotesResult, treeResult, configResult] =
          await Promise.allSettled([
            client.query.groups.post(postRef),
            client.query.groups.quotes(postRef, {
              limit: QUOTE_PAGE_SIZE,
              order: 'desc',
            }),
            client.query.groups.threadTree(postRef, {
              depth: REPLY_TREE_DEPTH,
              includeQuotes: false,
              replyLimit: REPLY_PAGE_SIZE,
              maxNodes: REPLY_TREE_MAX_NODES,
            }),
            client.groups.getConfig(groupId),
          ]);

        if (threadKeyRef.current !== threadKey) return;
        if (refreshRequestIdRef.current !== requestId) return;

        if (rootResult.status === 'rejected') {
          throw rootResult.reason;
        }

        const root = rootResult.value;
        // Soft refresh must not blank a painted SSR thread on a null miss.
        if (options.background && !root) {
          return;
        }
        const fetchedQuotes =
          quotesResult.status === 'fulfilled' ? quotesResult.value : [];
        const fetchedTree =
          treeResult.status === 'fulfilled' ? treeResult.value.replies : [];
        const fetchedTreePosts = flattenTreePosts(fetchedTree);

        setLocalReplies((current) =>
          withoutIndexedPosts(current, fetchedTreePosts)
        );
        setLocalQuotes((current) =>
          withoutIndexedPosts(current, fetchedQuotes)
        );

        // Once the user paginated past the first page, a background
        // first-page fetch would discard loaded pages — reconcile only.
        if (!options.background || !paginatedRef.current) {
          setConversation({
            root,
            replies: fetchedTree.map((node) => node.post),
            quotes: fetchedQuotes,
          });
          setReplyTree(fetchedTree);
          setHasMoreReplies(fetchedTree.length >= REPLY_PAGE_SIZE);
          setHasMoreQuotes(fetchedQuotes.length >= QUOTE_PAGE_SIZE);
          setLoadMoreError(null);
        }

        const rawConfig =
          configResult.status === 'fulfilled' ? configResult.value : null;

        if (rawConfig) {
          setGuildStructure(parseGuildStructure(rawConfig));
          const named =
            typeof rawConfig.name === 'string' ? rawConfig.name : null;
          setGuildName(named);
          setMemberDriven(
            rawConfig.member_driven === true || rawConfig.memberDriven === true
          );
        } else {
          setGuildStructure(null);
          setGuildName(null);
          setMemberDriven(false);
        }

        // Thread/conversation first; compose affordances hydrate with viewer.
        if (!options.background) {
          setLoadState(root ? 'ready' : 'missing');
        }

        if (accountId && rawConfig) {
          const structure = parseGuildStructure(rawConfig);
          const gated =
            rawConfig.is_private === true || rawConfig.isPrivate === true;
          const memberDriven =
            rawConfig.member_driven === true || rawConfig.memberDriven === true;
          const { viewer } = await resolveGuildViewerAccess(
            client,
            groupId,
            accountId,
            {
              memberDriven,
              accessGated: gated,
            }
          );
          if (threadKeyRef.current !== threadKey) return;
          if (refreshRequestIdRef.current !== requestId) return;
          const canWriteSpaceIds = await resolveViewerAllowlistSpaceIds(
            client,
            groupId,
            accountId,
            structure,
            viewer
          );
          if (threadKeyRef.current !== threadKey) return;
          if (refreshRequestIdRef.current !== requestId) return;
          const pending =
            Boolean(viewer.pendingJoinProposalId) ||
            viewer.joinRequest?.status === 'pending';
          setPendingJoinProposalId(viewer.pendingJoinProposalId ?? null);
          setJoinCancelReady(pending);
          setViewerAccess({ ...viewer, canWriteSpaceIds });
          setIsMember(viewer.isMember);
          setIsBlacklisted(viewer.isBlacklisted);
          setAccessGated(gated);
          setJoinPending(pending);
          writeGuildMembershipCache(accountId, groupId, {
            isMember: viewer.isMember,
            joinPending: pending,
          });
          setViewerAccessResolved(true);
        } else {
          setViewerAccess(EMPTY_GUILD_THREAD_ACCESS);
          setIsMember(false);
          setIsBlacklisted(false);
          setPendingJoinProposalId(null);
          setJoinCancelReady(false);
          setAccessGated(
            rawConfig
              ? rawConfig.is_private === true || rawConfig.isPrivate === true
              : false
          );
          setJoinPending(false);
          setViewerAccessResolved(true);
        }
      } catch (cause) {
        if (options.background) return;
        if (threadKeyRef.current !== threadKey) return;
        if (refreshRequestIdRef.current !== requestId) return;
        setLoadState('error');
        setError(guildThreadLoadError(cause));
      }
    },
    [accountId, author, groupId, postId, threadKey]
  );

  useEffect(() => {
    if (walletLoading) return;
    setViewerAccessResolved(false);
    // Soft reconcile after SSR — keep thread painted while ACL hydrates.
    if (ssrSeedRef.current) {
      ssrSeedRef.current = false;
      void refresh({ background: true });
      return;
    }
    void refresh();
  }, [refresh, walletLoading]);

  useEffect(() => {
    paginatedRef.current = false;
    setLoadMoreError(null);
  }, [threadKey]);

  useEffect(() => {
    const timers = reconcileTimersRef.current;
    return () => {
      for (const timer of timers) window.clearTimeout(timer);
    };
  }, []);

  const scheduleReconcile = useCallback(() => {
    for (const delay of RECONCILE_DELAYS_MS) {
      reconcileTimersRef.current.push(
        window.setTimeout(() => {
          void refresh({ background: true });
        }, delay)
      );
    }
  }, [refresh]);

  const loadMore = useCallback(
    (tab: GuildThreadTab) => {
      if (loadMoreInFlightRef.current) return;
      loadMoreInFlightRef.current = true;
      setLoadingMore(true);
      setLoadMoreError(null);
      const requestKey = threadKey;
      const repliesOffset = conversation.replies.length;
      const quotesOffset = conversation.quotes.length;
      void (async () => {
        try {
          const client = createReadOnlyOnSocialClient();
          if (tab === 'replies') {
            const page = await client.query.threads.repliesByPath(rootPath, {
              limit: REPLY_PAGE_SIZE,
              offset: repliesOffset,
            });
            if (threadKeyRef.current !== requestKey) return;
            paginatedRef.current = true;
            setConversation((current) => ({
              ...current,
              replies: [...current.replies, ...page],
            }));
            // Extra pages join as top-level rows; their own descendants
            // arrive with the next full refresh.
            setReplyTree((current) => [
              ...current,
              ...page.map((post) =>
                leafThreadNode(
                  post,
                  groupPostContentPath(post.accountId, groupId, post.postId)
                )
              ),
            ]);
            setHasMoreReplies(page.length >= REPLY_PAGE_SIZE);
          } else {
            const page = await client.query.threads.quotesByPath(rootPath, {
              limit: QUOTE_PAGE_SIZE,
              offset: quotesOffset,
              order: 'desc',
            });
            if (threadKeyRef.current !== requestKey) return;
            paginatedRef.current = true;
            setConversation((current) => ({
              ...current,
              quotes: [...current.quotes, ...page],
            }));
            setHasMoreQuotes(page.length >= QUOTE_PAGE_SIZE);
          }
        } catch (cause) {
          if (threadKeyRef.current !== requestKey) return;
          // Keep the current list; Retry replaces the button so it stays usable.
          setLoadMoreError(guildThreadLoadMoreError(tab, cause));
        } finally {
          if (threadKeyRef.current === requestKey) {
            loadMoreInFlightRef.current = false;
            setLoadingMore(false);
          }
        }
      })();
    },
    [
      conversation.quotes.length,
      conversation.replies.length,
      groupId,
      rootPath,
      threadKey,
    ]
  );

  const applyMembershipOutcome = useCallback(
    (outcome: GuildMembershipOutcome) => {
      const next = nextGuildThreadMembership(outcome);
      if (next.isMember !== undefined) setIsMember(next.isMember);
      if (next.joinPending !== undefined) setJoinPending(next.joinPending);
      if (next.joinCancelReady !== undefined) {
        setJoinCancelReady(next.joinCancelReady);
      }
      if (next.pendingJoinProposalId !== undefined) {
        setPendingJoinProposalId(next.pendingJoinProposalId);
      }
      if (next.clearViewerMembership) {
        setViewerAccess((current) => ({
          ...current,
          isMember: false,
          isOwner: false,
          isAdmin: false,
          canModerate: false,
        }));
      }
    },
    []
  );

  return {
    loadState,
    error,
    conversation,
    replyTree,
    localReplies,
    setLocalReplies,
    localQuotes,
    setLocalQuotes,
    guildStructure,
    guildName,
    viewerAccess,
    isMember,
    isBlacklisted,
    accessGated,
    memberDriven,
    joinPending,
    joinCancelReady,
    pendingJoinProposalId,
    viewerAccessResolved,
    hasMoreReplies,
    hasMoreQuotes,
    loadingMore,
    loadMoreError,
    rootPath,
    refresh,
    loadMore,
    scheduleReconcile,
    applyMembershipOutcome,
  };
}
