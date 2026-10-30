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
  type GuildThreadLoadState,
} from '@/features/guilds/guild-thread-data';
import {
  parseGuildStructure,
  type GuildStructureDocument,
  type GuildViewerAccess,
} from '@/features/guilds/guild-structure';
import { resolveViewerAllowlistSpaceIds } from '@/features/guilds/guild-space-write';
import { resolveGuildViewerAccess } from '@/features/guilds/guild-viewer-access';
import { createReadOnlyOnSocialClient } from '@/lib/create-readonly-onsocial-client';
import type { PostEngagementMap } from '@/lib/feed-paint-hydrate';
import {
  directRepliesToTree,
  shouldPaintDirectReplies,
  startThreadFirstPage,
} from '@/lib/thread-first-page';
import { planThreadLoad } from '@/lib/thread-open';
import {
  readGuildThreadSession,
  writeGuildThreadSession,
} from '@/lib/thread-session-cache';
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

export type { GuildThreadLoadState } from '@/features/guilds/guild-thread-data';
export {
  GUILD_THREAD_LOAD_ERROR,
  GUILD_THREAD_LOAD_MORE_REPLIES_ERROR,
  groupPostContentPath,
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
  engagementLatestRef = null,
}: {
  groupId: string;
  author: string;
  postId: string;
  initial?: GuildPostPageData | null;
  accountId: string | null;
  walletLoading: boolean;
  /** Live engagement map from the panel, read when snapshots are written. */
  engagementLatestRef?: { current: PostEngagementMap | null } | null;
}): {
  loadState: GuildThreadLoadState;
  error: string | null;
  /** False until the first tree fetch resolves — gates the discover peek. */
  repliesResolved: boolean;
  /** Engagement the panel's `usePostEngagement` should seed from. */
  seededEngagement: PostEngagementMap | null;
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
  loadingMore: boolean;
  loadMoreError: string | null;
  rootPath: string;
  refresh: (options?: { background?: boolean }) => Promise<void>;
  loadMore: () => void;
  scheduleReconcile: () => void;
  applyMembershipOutcome: (outcome: GuildMembershipOutcome) => void;
} {
  const threadKey = `${groupId}/${author}/${postId}`;
  const threadKeyRef = useRef(threadKey);
  threadKeyRef.current = threadKey;
  const rootPath = groupPostContentPath(author, groupId, postId);
  /*
   * Stale-while-revalidate seed, mirroring the personal thread panel: a
   * guild thread opened earlier this session paints its replies instantly
   * from the session cache while `refresh` revalidates in the background.
   * Full SSR data (direct page load) is fresher and wins; the tapped feed
   * row always stays the root — it is what the user saw.
   */
  const [sessionSeed] = useState(() => {
    const cached =
      initial && initial.replyTree.length > 0
        ? null
        : readGuildThreadSession(rootPath);
    if (!cached) return { data: initial, fromCache: false };
    return {
      fromCache: true,
      data: {
        root: initial?.root ?? cached.root,
        replies: cached.replies,
        quotes: cached.quotes,
        replyTree: cached.replyTree,
        hasMoreReplies: cached.hasMoreReplies,
        guildName: initial?.guildName ?? cached.guildName,
        memberDriven: initial?.memberDriven ?? cached.memberDriven,
        accessGated: initial?.accessGated ?? cached.accessGated,
        engagement: { ...cached.engagement, ...(initial?.engagement ?? {}) },
        scarceEmbeds: initial?.scarceEmbeds ?? {},
      } satisfies GuildPostPageData,
    };
  });
  const seeded = sessionSeed.data;
  const [loadState, setLoadState] = useState<GuildThreadLoadState>(() =>
    seeded ? 'ready' : 'loading'
  );
  const [conversation, setConversation] = useState<GroupConversation>(() =>
    conversationFromInitial(seeded)
  );
  const [replyTree, setReplyTree] = useState<ThreadNode[]>(
    () => seeded?.replyTree ?? []
  );
  /*
   * Discover-peek gate. Until the first reply page resolves we cannot know
   * whether replies exist — mounting the peek in that window flashes a
   * "More from …" card that the incoming replies then replace. A cache hit
   * or a permalink that already fetched the page counts as resolved.
   */
  const [repliesResolved, setRepliesResolved] = useState(
    () =>
      sessionSeed.fromCache || Boolean(sessionSeed.data?.directRepliesResolved)
  );
  const [localReplies, setLocalReplies] = useState<PostRow[]>([]);
  const [localQuotes, setLocalQuotes] = useState<PostRow[]>([]);
  const [guildStructure, setGuildStructure] =
    useState<GuildStructureDocument | null>(null);
  const [guildName, setGuildName] = useState<string | null>(
    () => seeded?.guildName ?? null
  );
  const [viewerAccess, setViewerAccess] = useState<GuildViewerAccess>(
    EMPTY_GUILD_THREAD_ACCESS
  );
  const [isMember, setIsMember] = useState(false);
  const [isBlacklisted, setIsBlacklisted] = useState(false);
  const [accessGated, setAccessGated] = useState(
    () => seeded?.accessGated ?? false
  );
  const [memberDriven, setMemberDriven] = useState(
    () => seeded?.memberDriven ?? false
  );
  const [joinPending, setJoinPending] = useState(false);
  const [joinCancelReady, setJoinCancelReady] = useState(false);
  const [pendingJoinProposalId, setPendingJoinProposalId] = useState<
    string | null
  >(null);
  const [viewerAccessResolved, setViewerAccessResolved] = useState(false);
  const [hasMoreReplies, setHasMoreReplies] = useState(
    () => seeded?.hasMoreReplies ?? false
  );
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadMoreError, setLoadMoreError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const paginatedRef = useRef(false);
  const reconcileTimersRef = useRef<number[]>([]);
  const paintedKeyRef = useRef<string | null>(seeded ? threadKey : null);
  const loadMoreInFlightRef = useRef(false);
  const refreshRequestIdRef = useRef(0);
  /*
   * Snapshot-writes need guild meta even when this fetch's config leg
   * failed; mirror the current state so refresh can read it off-render.
   */
  const guildMetaRef = useRef({ guildName, memberDriven, accessGated });
  guildMetaRef.current = { guildName, memberDriven, accessGated };

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
        const paintDirect = shouldPaintDirectReplies({
          fromCache: sessionSeed.fromCache,
          paginated: paginatedRef.current,
          directRepliesResolved: sessionSeed.data?.directRepliesResolved,
        });
        const firstPagePromise = paintDirect
          ? startThreadFirstPage(rootPath)
          : null;
        const restPromise = Promise.allSettled([
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

        if (firstPagePromise) {
          try {
            const first = await firstPagePromise;
            if (threadKeyRef.current !== threadKey) return;
            if (refreshRequestIdRef.current !== requestId) return;
            if (!paginatedRef.current) {
              const pageTree = directRepliesToTree(first.replies);
              setConversation((current) => ({
                ...current,
                replies: first.replies,
              }));
              setReplyTree(pageTree);
              setHasMoreReplies(first.hasMore);
              setRepliesResolved(true);
              const root = seeded?.root ?? null;
              if (root) {
                writeGuildThreadSession(rootPath, {
                  root,
                  replies: first.replies,
                  quotes: seeded?.quotes ?? [],
                  replyTree: pageTree,
                  hasMoreReplies: first.hasMore,
                  guildName: seeded?.guildName ?? null,
                  memberDriven: seeded?.memberDriven ?? false,
                  accessGated: seeded?.accessGated ?? false,
                  engagement: engagementLatestRef?.current ?? {},
                  scarceEmbeds: {},
                });
              }
            }
          } catch {
            // The tree walk below still resolves the thread.
          }
        }

        const [rootResult, quotesResult, treeResult, configResult] =
          await restPromise;

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
        const treeOk = treeResult.status === 'fulfilled';
        const fetchedTree = treeOk ? treeResult.value.replies : [];
        const fetchedTreePosts = flattenTreePosts(fetchedTree);

        setLocalReplies((current) =>
          withoutIndexedPosts(current, fetchedTreePosts)
        );
        setLocalQuotes((current) =>
          withoutIndexedPosts(current, fetchedQuotes)
        );

        // Once the user paginated past the first page, a background
        // first-page fetch would discard loaded pages — reconcile only.
        // A failed walk keeps the direct page already on screen.
        if (!options.background || !paginatedRef.current) {
          setConversation((current) => ({
            root,
            replies: treeOk
              ? fetchedTree.map((node) => node.post)
              : current.replies,
            quotes: fetchedQuotes,
          }));
          if (treeOk) {
            setReplyTree(fetchedTree);
            setHasMoreReplies(fetchedTree.length >= REPLY_PAGE_SIZE);
            setLoadMoreError(null);
          }
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

        if (treeOk && root && (!options.background || !paginatedRef.current)) {
          writeGuildThreadSession(rootPath, {
            root,
            replies: fetchedTree.map((node) => node.post),
            quotes: fetchedQuotes,
            replyTree: fetchedTree,
            hasMoreReplies: fetchedTree.length >= REPLY_PAGE_SIZE,
            guildName:
              rawConfig && typeof rawConfig.name === 'string'
                ? rawConfig.name
                : guildMetaRef.current.guildName,
            memberDriven: rawConfig
              ? rawConfig.member_driven === true ||
                rawConfig.memberDriven === true
              : guildMetaRef.current.memberDriven,
            accessGated: rawConfig
              ? rawConfig.is_private === true || rawConfig.isPrivate === true
              : guildMetaRef.current.accessGated,
            engagement: engagementLatestRef?.current ?? {},
            // Scarce embeds only ever seed from SSR; the ledger refetches.
            scarceEmbeds: {},
          });
        }
        setRepliesResolved(true);

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
        setRepliesResolved(true);
        setLoadState('error');
        setError(guildThreadLoadError(cause));
      }
    },
    [
      accountId,
      author,
      engagementLatestRef,
      groupId,
      postId,
      rootPath,
      seeded,
      sessionSeed.data?.directRepliesResolved,
      sessionSeed.fromCache,
      threadKey,
    ]
  );

  useEffect(() => {
    setViewerAccessResolved(false);
    let cancelled = false;
    const key = threadKey;
    // One load per setup. A second effect pass must not blank a painted card.
    // The thread read is public, so it does not wait for the wallet.
    queueMicrotask(() => {
      if (cancelled) return;
      const plan = planThreadLoad(paintedKeyRef.current, key);
      paintedKeyRef.current = plan.paintedKey;
      void refresh({ background: plan.background });
    });
    return () => {
      cancelled = true;
    };
  }, [refresh, threadKey]);

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

  const loadMore = useCallback(() => {
    if (loadMoreInFlightRef.current) return;
    loadMoreInFlightRef.current = true;
    setLoadingMore(true);
    setLoadMoreError(null);
    const requestKey = threadKey;
    const repliesOffset = conversation.replies.length;
    void (async () => {
      try {
        const client = createReadOnlyOnSocialClient();
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
      } catch (cause) {
        if (threadKeyRef.current !== requestKey) return;
        // Keep the current list; Retry replaces the button so it stays usable.
        setLoadMoreError(guildThreadLoadMoreError(cause));
      } finally {
        if (threadKeyRef.current === requestKey) {
          loadMoreInFlightRef.current = false;
          setLoadingMore(false);
        }
      }
    })();
  }, [conversation.replies.length, groupId, rootPath, threadKey]);

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
    repliesResolved,
    seededEngagement: seeded?.engagement ?? null,
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
    loadingMore,
    loadMoreError,
    rootPath,
    refresh,
    loadMore,
    scheduleReconcile,
    applyMembershipOutcome,
  };
}
