'use client';

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from 'react';
import type { GroupMemberRow, PostRow } from '@onsocial/sdk';
import {
  normalizeGuildConfig,
  type GuildConfigSnapshot,
} from '@/features/guilds/guild-config';
import { guildConfigFromIndexedRow } from '@/features/guilds/guild-facts';
import {
  readGuildOwnerId,
  reconcileGuildMemberRoster,
} from '@/features/guilds/guild-member-roster';
import { resolveViewerAllowlistSpaceIds } from '@/features/guilds/guild-space-write';
import {
  guildSpaceById,
  guildSpaceFeedChannel,
  type GuildViewerAccess,
} from '@/features/guilds/guild-structure';
import { resolveGuildViewerAccess } from '@/features/guilds/guild-viewer-access';
import { postKey } from '@/features/home/post-card';
import { createReadOnlyOnSocialClient } from '@/lib/create-readonly-onsocial-client';
import type { GuildPageData } from '@/lib/load-guild-page';
import {
  readGuildShellCache,
  writeGuildShellCache,
  type GuildShellCacheEntry,
} from '@/lib/guild-shell-cache';
import {
  filterGuildPostsForSpace,
  readGuildFeedCache,
  readGuildPageCache,
  writeGuildFeedCache,
  writeGuildPageCache,
} from '@/lib/guild-page-cache';
import { writeGuildMembershipCache } from '@/lib/guild-membership-cache';
import { revokeDroppedOptimisticMedia } from '@/lib/post-media';
import { INDEXER_SOFT_RETRY_MS } from '@/lib/indexer-soft-retry';
import {
  emptyLiveGuildState,
  liveGuildStateFromSeed,
  pageCacheFromInitial,
  pendingJoinRequest,
  persistGuildPageCache,
  type GuildFeedFilterId,
  type GuildPageLoadState,
  type LiveGuildState,
} from '@/features/guilds/guild-page-data';

export type {
  GuildFeedFilterId,
  GuildPageLoadState,
  LiveGuildModerationState,
  LiveGuildState,
  ViewerGuildState,
} from '@/features/guilds/guild-page-data';
export { pendingJoinRequest } from '@/features/guilds/guild-page-data';

/**
 * Shell, feed, and ACL for the guild page.
 * Callers own compose, sheets, and membership mutations.
 */
export function useGuildPageData({
  groupId,
  initial = null,
  accountId,
  walletLoading,
  selectedFeedFilterId,
}: {
  groupId: string;
  initial?: GuildPageData | null;
  accountId: string | null;
  walletLoading: boolean;
  selectedFeedFilterId: GuildFeedFilterId;
}): {
  loadState: GuildPageLoadState;
  error: string | null;
  state: LiveGuildState;
  config: GuildConfigSnapshot | null;
  viewer: LiveGuildState['viewer'];
  shellPreview: GuildShellCacheEntry | null;
  shellExtrasResolved: boolean;
  viewerAccessResolved: boolean;
  feedPending: boolean;
  hasMorePosts: boolean;
  loadingMore: boolean;
  isFeedRefreshing: boolean;
  localPosts: PostRow[];
  setLocalPosts: Dispatch<SetStateAction<PostRow[]>>;
  allowlistSpaceIds: ReadonlySet<string>;
  viewerAccess: GuildViewerAccess;
  selectedFeedSpace: ReturnType<typeof guildSpaceById> | null;
  optimisticJoinPending: boolean;
  setOptimisticJoinPending: Dispatch<SetStateAction<boolean>>;
  refresh: () => Promise<void>;
  refreshFeed: (opts?: { silent?: boolean }) => Promise<void>;
  loadMoreFeed: () => void;
  scheduleReconcile: () => void;
} {
  const [loadState, setLoadState] = useState<GuildPageLoadState>(() =>
    initial || readGuildPageCache(groupId) || readGuildShellCache(groupId)
      ? 'ready'
      : 'loading'
  );
  const [state, setState] = useState<LiveGuildState>(() => {
    if (initial) {
      return liveGuildStateFromSeed({
        config: initial.config,
        stats: initial.stats,
        indexedMemberCount: initial.indexedMemberCount,
        postCount: initial.postCount,
        members: initial.members,
        posts: initial.posts,
      });
    }
    const cachedPage = readGuildPageCache(groupId);
    const cachedFeed = readGuildFeedCache(groupId, 'all');
    return liveGuildStateFromSeed({
      config: cachedPage?.config ?? null,
      stats: cachedPage?.stats ?? null,
      indexedMemberCount: cachedPage?.indexedMemberCount ?? null,
      postCount: cachedPage?.postCount ?? null,
      members: cachedPage?.members ?? [],
      posts: cachedFeed?.posts ?? [],
    });
  });
  const structureHydratedRef = useRef(
    Boolean(
      initial?.structureResolved ||
        readGuildPageCache(groupId)?.structureResolved
    )
  );
  const structureRetryTimersRef = useRef<number[]>([]);
  /** Skip one auto feed refresh when SSR or cache already painted the default feed. */
  const skipSsrFeedRefreshRef = useRef(
    Boolean(initial && initial.posts != null) ||
      Boolean(readGuildFeedCache(groupId, 'all'))
  );
  const configRef = useRef<GuildConfigSnapshot | null>(initial?.config ?? null);
  const [localPosts, setLocalPosts] = useState<PostRow[]>([]);
  const [hasMorePosts, setHasMorePosts] = useState(
    () =>
      initial?.hasMorePosts ??
      readGuildFeedCache(groupId, 'all')?.hasMore ??
      false
  );
  const [loadingMore, setLoadingMore] = useState(false);
  const [isFeedRefreshing, setIsFeedRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [optimisticJoinPending, setOptimisticJoinPending] = useState(false);
  const [shellPreview, setShellPreview] = useState<GuildShellCacheEntry | null>(
    () =>
      initial?.shell ??
      readGuildPageCache(groupId)?.shell ??
      readGuildShellCache(groupId) ??
      null
  );
  const [shellExtrasResolved, setShellExtrasResolved] = useState(() =>
    Boolean(initial)
  );
  /** ACL resolved — separate from shell paint so join/leave never guess. */
  const [viewerAccessResolved, setViewerAccessResolved] = useState(false);
  const [feedPending, setFeedPending] = useState(
    () => !initial && !readGuildFeedCache(groupId, 'all')
  );
  const ssrGroupIdRef = useRef(initial ? groupId : null);
  const [allowlistSpaceIds, setAllowlistSpaceIds] = useState<
    ReadonlySet<string>
  >(() => new Set());
  const hasLoadedRef = useRef(
    Boolean(
      initial ||
        readGuildPageCache(groupId) ||
        readGuildFeedCache(groupId, 'all')
    )
  );
  const reconcileTimersRef = useRef<number[]>([]);
  const loadMoreInFlightRef = useRef(false);
  const groupIdRef = useRef(groupId);
  groupIdRef.current = groupId;
  const guildShellRequestIdRef = useRef(0);
  const guildFeedRequestIdRef = useRef(0);
  const selectedFeedFilterIdRef = useRef(selectedFeedFilterId);
  selectedFeedFilterIdRef.current = selectedFeedFilterId;

  const config = state.config;
  configRef.current = config;
  const viewer = state.viewer;
  const selectedFeedSpace =
    selectedFeedFilterId === 'all' || !config
      ? null
      : guildSpaceById(config.structure, selectedFeedFilterId);
  const viewerAccess = useMemo(
    () => ({
      isMember: viewer?.isMember ?? false,
      canModerate: viewer?.canModerate ?? false,
      isAdmin: viewer?.isAdmin ?? false,
      isOwner: viewer?.isOwner ?? false,
      canWriteSpaceIds: allowlistSpaceIds,
    }),
    [allowlistSpaceIds, viewer]
  );

  const refreshFeed = useCallback(
    async (opts?: { silent?: boolean }) => {
      const requestId = ++guildFeedRequestIdRef.current;
      const filterId = selectedFeedSpace?.id ?? 'all';
      if (!opts?.silent) setIsFeedRefreshing(true);
      setError(null);

      try {
        const client = createReadOnlyOnSocialClient();
        const feedResult = await (selectedFeedSpace
          ? client.query.groups.feedFiltered({
              groupId,
              channel: guildSpaceFeedChannel(selectedFeedSpace),
              limit: 20,
            })
          : client.query.groups.feed({ groupId, limit: 20 }));
        if (
          guildFeedRequestIdRef.current !== requestId ||
          groupIdRef.current !== groupId
        ) {
          return;
        }

        const fetchedPosts = feedResult.items ?? [];
        const hasMore = feedResult.nextOffset !== undefined;
        writeGuildFeedCache(groupId, filterId, {
          posts: fetchedPosts,
          hasMore,
        });
        const indexedKeys = new Set(fetchedPosts.map(postKey));
        setLocalPosts((current) => {
          const next = current.filter(
            (post) => !indexedKeys.has(postKey(post))
          );
          revokeDroppedOptimisticMedia(current, next);
          return next;
        });
        setState((current) => ({
          ...current,
          posts: fetchedPosts,
          feedError: null,
        }));
        setHasMorePosts(hasMore);
      } catch (cause) {
        if (
          guildFeedRequestIdRef.current !== requestId ||
          groupIdRef.current !== groupId
        ) {
          return;
        }
        setState((current) => ({
          ...current,
          feedError:
            cause instanceof Error
              ? cause.message
              : 'Could not load guild posts.',
        }));
      } finally {
        if (
          guildFeedRequestIdRef.current === requestId &&
          groupIdRef.current === groupId
        ) {
          setIsFeedRefreshing(false);
        }
      }
    },
    [groupId, selectedFeedSpace]
  );

  const applyViewerAccess = useCallback(
    async (
      client: ReturnType<typeof createReadOnlyOnSocialClient>,
      normalizedConfig: GuildConfigSnapshot
    ) => {
      if (!accountId) {
        if (groupIdRef.current !== groupId) return;
        setAllowlistSpaceIds(new Set());
        setState((current) => ({
          ...current,
          viewer: null,
          moderation: null,
        }));
        setShellExtrasResolved(true);
        setViewerAccessResolved(true);
        return;
      }

      // Fast membership hint from indexer before heavier ACL RPCs.
      try {
        const membership = await client.query.groups.membershipFor(
          groupId,
          accountId
        );
        if (membership && groupIdRef.current === groupId) {
          writeGuildMembershipCache(accountId, groupId, {
            isMember: true,
            joinPending: false,
          });
        }
      } catch {
        // Cache hint is best-effort.
      }
      if (groupIdRef.current !== groupId) return;

      const resolved = await resolveGuildViewerAccess(
        client,
        groupId,
        accountId,
        {
          memberDriven: normalizedConfig.memberDriven,
          accessGated: normalizedConfig.accessGated,
        }
      );
      const viewerState = resolved?.viewer ?? null;
      const moderationState = resolved?.moderation ?? null;
      if (groupIdRef.current !== groupId) return;

      if (viewerState?.isMember) {
        try {
          const granted = await resolveViewerAllowlistSpaceIds(
            client,
            groupId,
            accountId,
            normalizedConfig.structure,
            viewerState
          );
          setAllowlistSpaceIds(granted);
        } catch {
          setAllowlistSpaceIds(new Set());
        }
      } else {
        setAllowlistSpaceIds(new Set());
      }
      if (groupIdRef.current !== groupId) return;

      setState((current) => ({
        ...current,
        viewer: viewerState,
        moderation: moderationState,
      }));

      const joinPendingFromViewer =
        pendingJoinRequest(viewerState?.joinRequest ?? null) ||
        Boolean(viewerState?.pendingJoinProposalId);
      writeGuildMembershipCache(accountId, groupId, {
        isMember: Boolean(viewerState?.isMember),
        joinPending: joinPendingFromViewer,
      });
      setShellExtrasResolved(true);
      setViewerAccessResolved(true);
    },
    [accountId, groupId]
  );

  const clearStructureRetryTimers = useCallback(() => {
    for (const timer of structureRetryTimersRef.current) {
      window.clearTimeout(timer);
    }
    structureRetryTimersRef.current = [];
  }, []);

  /** Soft path after SSR: ACL + structure only — keep indexer shell/feed. */
  const refreshViewerAccess = useCallback(async () => {
    setError(null);
    const client = createReadOnlyOnSocialClient();
    const currentConfig = configRef.current;
    if (!currentConfig) {
      setShellExtrasResolved(true);
      setViewerAccessResolved(!accountId);
      return;
    }

    if (!structureHydratedRef.current) {
      try {
        const rawConfig = await client.groups.getConfig(groupId);
        if (groupIdRef.current !== groupId) return;
        if (rawConfig) {
          const fromRpc = normalizeGuildConfig(groupId, rawConfig);
          structureHydratedRef.current = true;
          clearStructureRetryTimers();
          setState((current) => ({
            ...current,
            config: {
              ...(current.config ?? currentConfig),
              structure: fromRpc.structure,
              // Prefer RPC for name/topics if indexer lagged, keep painted shell otherwise.
              name: fromRpc.name || (current.config ?? currentConfig).name,
              description:
                fromRpc.description ||
                (current.config ?? currentConfig).description,
              topics:
                fromRpc.topics.length > 0
                  ? fromRpc.topics
                  : (current.config ?? currentConfig).topics,
              accessGated: fromRpc.accessGated,
              memberDriven: fromRpc.memberDriven,
              ownerId:
                fromRpc.ownerId ?? (current.config ?? currentConfig).ownerId,
              // Prefer RPC media even when null (removal must clear painted shell).
              bannerUrl: fromRpc.bannerUrl,
              badgeUrl: fromRpc.badgeUrl,
            },
          }));
          await applyViewerAccess(client, fromRpc);
          return;
        }
      } catch {
        // Keep default structure; still resolve ACL.
      }
      // Soft retry so a transient getConfig miss doesn't stick on defaults.
      if (structureRetryTimersRef.current.length === 0) {
        structureRetryTimersRef.current = INDEXER_SOFT_RETRY_MS.map((delay) =>
          window.setTimeout(() => {
            if (structureHydratedRef.current) return;
            void refreshViewerAccess();
          }, delay)
        );
      }
    }

    await applyViewerAccess(client, currentConfig);
  }, [accountId, applyViewerAccess, clearStructureRetryTimers, groupId]);

  /** Client navigation / cold load — indexer shell first, then ACL. */
  const refreshShell = useCallback(async () => {
    const requestId = ++guildShellRequestIdRef.current;
    setError(null);
    const client = createReadOnlyOnSocialClient();

    const [
      indexedRows,
      feedResult,
      membersResult,
      countResult,
      postCountResult,
    ] = await Promise.all([
      client.query.groups.byIds([groupId]).catch(() => []),
      client.query.groups
        .feed({ groupId, limit: 20 })
        .catch(() => ({ items: [] as PostRow[], nextOffset: undefined })),
      client.query.groups
        .membersOf(groupId, { limit: 8 })
        .catch(() => ({ items: [] as GroupMemberRow[] })),
      client.query.groups
        .memberCountsFor([groupId])
        .catch(() => new Map<string, number>()),
      client.query.groups.postCountFor(groupId).catch(() => null),
    ]);
    if (
      guildShellRequestIdRef.current !== requestId ||
      groupIdRef.current !== groupId
    ) {
      return false;
    }

    const indexed = indexedRows[0] ?? null;
    if (indexed) {
      const fromIndexer = guildConfigFromIndexedRow(groupId, indexed);
      const shellEntry: GuildShellCacheEntry = {
        name: fromIndexer.name,
        bannerUrl: fromIndexer.bannerUrl,
        badgeUrl: fromIndexer.badgeUrl,
        accessGated: fromIndexer.accessGated,
        memberDriven: fromIndexer.memberDriven,
        description: fromIndexer.description,
        topics: fromIndexer.topics,
      };
      const members = reconcileGuildMemberRoster(
        membersResult.items ?? [],
        fromIndexer.ownerId
      );
      const posts = feedResult.items ?? [];
      const hasMore = feedResult.nextOffset !== undefined;
      persistGuildPageCache(
        groupId,
        {
          config: fromIndexer,
          shell: shellEntry,
          stats: null,
          indexedMemberCount: countResult.get(groupId) ?? null,
          members,
          postCount: postCountResult,
          structureResolved: structureHydratedRef.current,
        },
        { filterId: 'all', posts, hasMore }
      );
      const applyDefaultFeed = selectedFeedFilterIdRef.current === 'all';
      setShellPreview(shellEntry);
      setState((current) => ({
        ...current,
        config: current.config
          ? {
              ...fromIndexer,
              structure: structureHydratedRef.current
                ? current.config.structure
                : fromIndexer.structure,
            }
          : fromIndexer,
        indexedMemberCount: countResult.get(groupId) ?? null,
        postCount: postCountResult,
        members,
        posts: applyDefaultFeed ? posts : current.posts,
        feedError: applyDefaultFeed ? null : current.feedError,
      }));
      if (applyDefaultFeed) setHasMorePosts(hasMore);
      setLoadState('ready');
    }

    let normalizedConfig: GuildConfigSnapshot | null = indexed
      ? guildConfigFromIndexedRow(groupId, indexed)
      : null;

    try {
      const rawConfig = await client.groups.getConfig(groupId);
      if (
        guildShellRequestIdRef.current !== requestId ||
        groupIdRef.current !== groupId
      ) {
        return false;
      }
      if (rawConfig) {
        normalizedConfig = normalizeGuildConfig(groupId, rawConfig);
        structureHydratedRef.current = true;
        clearStructureRetryTimers();
        const shellEntry: GuildShellCacheEntry = {
          name: normalizedConfig.name,
          bannerUrl: normalizedConfig.bannerUrl,
          badgeUrl: normalizedConfig.badgeUrl,
          accessGated: normalizedConfig.accessGated,
          memberDriven: normalizedConfig.memberDriven,
          description: normalizedConfig.description,
          topics: normalizedConfig.topics,
        };
        writeGuildShellCache(groupId, shellEntry);
        const cachedPage = readGuildPageCache(groupId);
        if (cachedPage) {
          writeGuildPageCache(groupId, {
            ...cachedPage,
            config: normalizedConfig,
            shell: shellEntry,
            structureResolved: true,
          });
        }
        setShellPreview(shellEntry);
        setState((current) => ({
          ...current,
          config: normalizedConfig!,
          members: reconcileGuildMemberRoster(
            current.members,
            readGuildOwnerId(rawConfig)
          ),
        }));
        setLoadState('ready');
      }
    } catch {
      // Indexer shell may already be enough.
    }
    if (
      guildShellRequestIdRef.current !== requestId ||
      groupIdRef.current !== groupId
    ) {
      return false;
    }

    if (!normalizedConfig && !indexed) {
      setState(emptyLiveGuildState());
      setLoadState('missing');
      setShellExtrasResolved(true);
      setViewerAccessResolved(!accountId);
      return false;
    }

    if (!normalizedConfig) {
      setShellExtrasResolved(true);
      setViewerAccessResolved(!accountId);
      return true;
    }

    // Optional chain stats for facts (created_at); do not block paint.
    void client.groups
      .getStats(groupId)
      .then((stats) => {
        if (
          guildShellRequestIdRef.current !== requestId ||
          groupIdRef.current !== groupId
        ) {
          return;
        }
        setState((current) => ({ ...current, stats }));
      })
      .catch(() => {});

    await applyViewerAccess(client, normalizedConfig);
    return true;
  }, [accountId, applyViewerAccess, clearStructureRetryTimers, groupId]);

  const refresh = useCallback(async () => {
    const keepPainted =
      hasLoadedRef.current ||
      Boolean(readGuildPageCache(groupId)) ||
      Boolean(readGuildShellCache(groupId));
    if (!keepPainted) {
      setLoadState('loading');
    }
    setError(null);
    if (!keepPainted) setFeedPending(true);

    try {
      const shellReady = await refreshShell();
      setFeedPending(false);
      hasLoadedRef.current = true;
      if (!shellReady) return;
    } catch (cause) {
      setFeedPending(false);
      if (!hasLoadedRef.current && !keepPainted) {
        setLoadState('error');
      }
      setError(
        cause instanceof Error ? cause.message : 'Could not load guild.'
      );
    }
  }, [groupId, refreshShell]);

  useEffect(() => {
    clearStructureRetryTimers();
    guildShellRequestIdRef.current += 1;
    guildFeedRequestIdRef.current += 1;
    setLocalPosts([]);
    setAllowlistSpaceIds(new Set());

    // Parent pairs `initial` with this groupId; still require the id so a
    // stale seed cannot paint the wrong guild.
    if (initial && initial.groupId === groupId) {
      persistGuildPageCache(groupId, pageCacheFromInitial(initial), {
        filterId: 'all',
        posts: initial.posts,
        hasMore: initial.hasMorePosts,
      });
      setShellPreview(initial.shell);
      setShellExtrasResolved(true);
      setViewerAccessResolved(false);
      setFeedPending(false);
      setHasMorePosts(initial.hasMorePosts);
      setLoadState('ready');
      structureHydratedRef.current = Boolean(initial.structureResolved);
      skipSsrFeedRefreshRef.current = true;
      ssrGroupIdRef.current = groupId;
      setState(
        liveGuildStateFromSeed({
          config: initial.config,
          stats: initial.stats,
          indexedMemberCount: initial.indexedMemberCount,
          postCount: initial.postCount,
          members: initial.members,
          posts: initial.posts,
        })
      );
      hasLoadedRef.current = true;
      return;
    }

    const cachedPage = readGuildPageCache(groupId);
    const cachedFeed = readGuildFeedCache(groupId, 'all');
    const cachedShell =
      cachedPage?.shell ?? readGuildShellCache(groupId) ?? null;
    setShellPreview(cachedShell);
    ssrGroupIdRef.current = null;

    if (cachedPage && cachedFeed) {
      structureHydratedRef.current = cachedPage.structureResolved;
      skipSsrFeedRefreshRef.current = true;
      setShellExtrasResolved(true);
      setViewerAccessResolved(false);
      setFeedPending(false);
      setHasMorePosts(cachedFeed.hasMore);
      setLoadState('ready');
      setState(
        liveGuildStateFromSeed({
          config: cachedPage.config,
          stats: cachedPage.stats,
          indexedMemberCount: cachedPage.indexedMemberCount,
          postCount: cachedPage.postCount,
          members: cachedPage.members,
          posts: cachedFeed.posts,
        })
      );
      hasLoadedRef.current = true;
      return;
    }

    structureHydratedRef.current = false;
    skipSsrFeedRefreshRef.current = false;
    setShellExtrasResolved(false);
    setViewerAccessResolved(false);
    setFeedPending(true);
    setLoadState(cachedShell ? 'ready' : 'loading');
    setState(
      liveGuildStateFromSeed({
        config: cachedPage?.config ?? null,
        stats: cachedPage?.stats ?? null,
        indexedMemberCount: cachedPage?.indexedMemberCount ?? null,
        postCount: cachedPage?.postCount ?? null,
        members: cachedPage?.members ?? [],
        posts: cachedFeed?.posts ?? [],
      })
    );
    if (cachedFeed) setHasMorePosts(cachedFeed.hasMore);
    hasLoadedRef.current = Boolean(cachedPage || cachedFeed);
  }, [clearStructureRetryTimers, groupId, initial]);

  useEffect(() => clearStructureRetryTimers, [clearStructureRetryTimers]);

  useEffect(() => {
    // Drop previous wallet's membership before extras resolve for the new one.
    setState((current) => ({
      ...current,
      viewer: null,
      moderation: null,
    }));
    setViewerAccessResolved(false);
    // Soft SSR keeps painted shell; ACL still re-resolves for the new wallet.
    const softSsr = ssrGroupIdRef.current === groupId && Boolean(initial);
    if (!softSsr) {
      setShellExtrasResolved(false);
    }
  }, [accountId, groupId, initial]);

  useEffect(() => {
    if (walletLoading) return;
    // Soft-reconcile viewer/ACL after SSR; full reload on client guild switch.
    const softSsr = ssrGroupIdRef.current === groupId && Boolean(initial);
    if (!accountId) {
      setViewerAccessResolved(true);
      if (softSsr) {
        hasLoadedRef.current = true;
        void refreshViewerAccess();
        return;
      }
    }
    if (softSsr) {
      hasLoadedRef.current = true;
      void refreshViewerAccess();
      return;
    }
    if (hasLoadedRef.current) {
      void refresh();
      return;
    }
    hasLoadedRef.current = false;
    void refresh();
    // Shell + feed load is scoped to guild/account changes; tab switches use refreshFeed.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- refreshFeed intentionally excluded
  }, [accountId, groupId, walletLoading, initial]);

  useEffect(() => {
    if (walletLoading || !hasLoadedRef.current) return;
    // Seeded default feed (SSR or cache) — skip the duplicate keyed query.
    if (skipSsrFeedRefreshRef.current && selectedFeedFilterId === 'all') {
      skipSsrFeedRefreshRef.current = false;
      return;
    }
    skipSsrFeedRefreshRef.current = false;

    const cached = readGuildFeedCache(groupId, selectedFeedFilterId);
    if (cached) {
      setState((current) => ({
        ...current,
        posts: cached.posts,
        feedError: null,
      }));
      setHasMorePosts(cached.hasMore);
      void refreshFeed({ silent: true });
      return;
    }

    if (selectedFeedSpace) {
      const allFeed = readGuildFeedCache(groupId, 'all');
      const optimistic = filterGuildPostsForSpace(
        allFeed?.posts ?? [],
        selectedFeedSpace
      );
      if (optimistic.length > 0) {
        setState((current) => ({
          ...current,
          posts: optimistic,
          feedError: null,
        }));
        setHasMorePosts(Boolean(allFeed?.hasMore));
        void refreshFeed({ silent: true });
        return;
      }
    }

    void refreshFeed();
  }, [
    groupId,
    refreshFeed,
    selectedFeedFilterId,
    selectedFeedSpace,
    walletLoading,
  ]);

  useEffect(() => {
    if (viewer?.pendingJoinProposalId || viewer?.isMember) {
      setOptimisticJoinPending(false);
    }
  }, [viewer?.isMember, viewer?.pendingJoinProposalId]);

  useEffect(() => {
    const timers = reconcileTimersRef.current;
    return () => {
      for (const timer of timers) window.clearTimeout(timer);
    };
  }, []);

  const scheduleReconcile = useCallback(() => {
    for (const delay of [2_000, 5_000]) {
      reconcileTimersRef.current.push(
        window.setTimeout(() => {
          void refresh();
        }, delay)
      );
    }
  }, [refresh]);

  const loadMoreFeed = useCallback(() => {
    if (loadMoreInFlightRef.current || !hasMorePosts) return;
    loadMoreInFlightRef.current = true;
    setLoadingMore(true);
    void (async () => {
      try {
        const client = createReadOnlyOnSocialClient();
        const page = selectedFeedSpace
          ? await client.query.groups.feedFiltered({
              groupId,
              channel: guildSpaceFeedChannel(selectedFeedSpace),
              limit: 20,
              offset: state.posts.length,
            })
          : await client.query.groups.feed({
              groupId,
              limit: 20,
              offset: state.posts.length,
            });
        const nextPosts = [...state.posts, ...(page.items ?? [])];
        const hasMore = page.nextOffset !== undefined;
        writeGuildFeedCache(groupId, selectedFeedSpace?.id ?? 'all', {
          posts: nextPosts,
          hasMore,
        });
        setState((current) => ({
          ...current,
          posts: [...current.posts, ...(page.items ?? [])],
        }));
        setHasMorePosts(hasMore);
      } catch {
        // Keep the current list; the sentinel stays available to retry.
      } finally {
        loadMoreInFlightRef.current = false;
        setLoadingMore(false);
      }
    })();
  }, [groupId, hasMorePosts, selectedFeedSpace, state.posts.length]);

  return {
    loadState,
    error,
    state,
    config,
    viewer,
    shellPreview,
    shellExtrasResolved,
    viewerAccessResolved,
    feedPending,
    hasMorePosts,
    loadingMore,
    isFeedRefreshing,
    localPosts,
    setLocalPosts,
    allowlistSpaceIds,
    viewerAccess,
    selectedFeedSpace,
    optimisticJoinPending,
    setOptimisticJoinPending,
    refresh,
    refreshFeed,
    loadMoreFeed,
    scheduleReconcile,
  };
}
