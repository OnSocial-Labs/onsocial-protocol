'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  postContentPath,
  type GroupMemberRow,
  type GroupStats,
  type JoinRequest,
  type PostRow,
} from '@onsocial/sdk';
import {
  Divider,
  InformationCircleIcon,
  OsIconAction,
  SettingsIcon,
} from '@onsocial/ui';
import { OsAppScreen } from '@/components/app/os-app-screen';
import { AppStorageSheet } from '@/components/wallet/app-storage-sheet';
import { useAppWallet } from '@/contexts/app-wallet-context';
import { useAppTransactionFeedback } from '@/contexts/app-transaction-feedback-context';
import {
  submitPersonalRepost,
  submitPersonalUnrepost,
} from '@/features/home/submit-personal-post';
import {
  useRegisterComposeAction,
  type WriteDockSubmit,
} from '@/contexts/compose-launcher-context';
import { useFeedReplyWriteDock } from '@/hooks/use-feed-reply-write-dock';
import { writeDockDraftKey } from '@/lib/os-write-dock';
import {
  clearWriteDockDraft,
  writeDockDraftFromComposer,
  writeDockExpandSeed,
  writeWriteDockDraft,
} from '@/lib/os-write-dock-draft';
import { PostRowSkeleton, postKey } from '@/features/home/post-card';
import { GuildFeedFilterList } from '@/features/guilds/guild-feed-filter-list';
import { postMetaFromText } from '@/features/home/post-mentions';
import { placesMetaFromComposer } from '@/lib/post-place';
import {
  GuildComposerSheet,
  type GuildComposerMode,
  type GuildComposerSubmit,
} from '@/features/guilds/guild-composer-sheet';
import {
  canPostToGuildSpace,
  canViewerPostInChannel,
  composerGuildSpaces,
  defaultComposerSpace,
  enabledGuildSpaces,
  guildSpaceById,
  guildSpaceFeedChannel,
  guildSpaceMatchesPostChannel,
} from '@/features/guilds/guild-structure';
import { inheritedGuildReplyFeedMeta } from '@/features/guilds/guild-post-feed-meta';
import { FeedThreadBlock } from '@/features/guilds/feed-thread-block';
import {
  collaborativeJoinNeedsStorage,
  GUILD_COLLABORATIVE_JOIN_STORAGE_HINT,
  normalizeGuildConfig,
  type GuildConfigSnapshot,
} from '@/features/guilds/guild-config';
import { GuildDescriptionClamp } from '@/features/guilds/guild-description-clamp';
import { GuildAddMemberSheet } from '@/features/guilds/guild-add-member-sheet';
import { GuildAddSpaceSheet } from '@/features/guilds/guild-add-space-sheet';
import {
  GuildManageMenu,
  type GuildManageSheetId,
} from '@/features/guilds/guild-manage-menu';
import { guildDisplayName } from '@/features/guilds/guild-card-display';
import {
  buildGuildFacepileIds,
  GuildFacepile,
} from '@/features/guilds/guild-facepile';
import {
  GuildMembershipJoinButton,
  guildMembershipJoinLabel,
  guildMembershipJoinPendingLabel,
} from '@/features/guilds/guild-membership-join-button';
import { GuildMemberRequestsSheet } from '@/features/guilds/guild-member-requests-sheet';
import { GuildMembersSheet } from '@/features/guilds/guild-members-sheet';
import { GuildEditSheet } from '@/features/guilds/guild-edit-sheet';
import { GuildFactsSheet } from '@/features/guilds/guild-facts-sheet';
import { GuildRoomsSheet } from '@/features/guilds/guild-rooms-sheet';
import { GuildSettingsSheet } from '@/features/guilds/guild-settings-sheet';
import { GuildGroupStorageSheet } from '@/features/guilds/guild-group-storage-sheet';
import { GuildProposalsSheet } from '@/features/guilds/guild-proposals-sheet';
import { GuildSpaceWritersSheet } from '@/features/guilds/guild-space-writers-sheet';
import { resolveViewerAllowlistSpaceIds } from '@/features/guilds/guild-space-write';
import {
  collectRelayTxHashes,
  guildPath,
  guildSheetPath,
  type GuildShareSheetId,
} from '@/features/guilds/guilds-data';
import { useAppOnSocialClient } from '@/hooks/use-app-onsocial-client';
import { useDockAutoHide } from '@/hooks/use-dock-auto-hide';
import { useInfiniteScrollSentinel } from '@/hooks/use-infinite-scroll-sentinel';
import { useUserStorageBalance } from '@/hooks/use-user-storage-balance';
import { coalesceFeedThreads } from '@/lib/feed-threads';
import { usePostAuthorProfiles } from '@/hooks/use-post-author-profiles';
import { usePostEngagement } from '@/hooks/use-post-engagement';
import { usePollVotes } from '@/hooks/use-poll-votes';
import { useQuotedPosts } from '@/hooks/use-quoted-posts';
import { withRepostOriginals } from '@/lib/post-relation';
import {
  applyMediaKindOverride,
  buildOptimisticMediaEntries,
  mediaKindFromFile,
  revokeDroppedOptimisticMedia,
} from '@/lib/post-media';
import { normalizeComposerContentLabels } from '@/lib/post-content-labels';
import { resolveGuildViewerAccess } from '@/features/guilds/guild-viewer-access';
import { topicLabel } from '@/lib/topic-slug';
import {
  readGuildOwnerId,
  reconcileGuildMemberRoster,
} from '@/features/guilds/guild-member-roster';
import { createReadOnlyOnSocialClient } from '@/lib/create-readonly-onsocial-client';
import {
  guildCoverStyle,
  guildHeroCoverClassName,
} from '@/features/guilds/guild-visual';
import type { GuildPageData } from '@/lib/load-guild-page';
import {
  guildAccessLabel,
  guildConfigFromIndexedRow,
  readGroupStatsCreatedAt,
  resolveGuildMemberCount,
} from '@/features/guilds/guild-facts';
import {
  readGuildShellCache,
  writeGuildShellCache,
  type GuildShellCacheEntry,
} from '@/lib/guild-shell-cache';
import {
  readGuildMembershipCache,
  writeGuildMembershipCache,
} from '@/lib/guild-membership-cache';
import {
  setGuildMembershipActionPending,
  useGuildMembershipActionPending,
} from '@/lib/guild-membership-action-pending';
import { seedScarceEmbedsFromSsr } from '@/features/scarces/scarce-embed-ledger';
import {
  commerceEmbedFromDraft,
  dropPostKind,
  dropSnapshotExtra,
  resolvedDropPostText,
} from '@/features/scarces/drop-post-payload';
import { isDropComposeDraftReady } from '@/features/scarces/drop-compose-draft';
import { subscribeGuildPostConfirmed } from '@/features/scarces/submit-guild-drop-post';
import { hydrateScarceEmbedsForPosts } from '@/lib/feed-paint-hydrate';
import { INDEXER_SOFT_RETRY_MS } from '@/lib/indexer-soft-retry';
import {
  txToastConfirming,
  txToastError,
  txToastSuccess,
} from '@/lib/transaction-toast-copy';
import { isWalletUserCancellation } from '@/lib/wallet-errors';

interface ViewerGuildState {
  isMember: boolean;
  isOwner: boolean;
  isAdmin: boolean;
  canModerate: boolean;
  isBlacklisted: boolean;
  joinRequest: JoinRequest | null;
  pendingJoinProposalId: string | null;
}

interface LiveGuildModerationState {
  pendingMemberRequestCount: number;
  activeProposalCount: number;
}

interface LiveGuildState {
  config: GuildConfigSnapshot | null;
  stats: GroupStats | null;
  indexedMemberCount: number | null;
  postCount: number | null;
  members: GroupMemberRow[];
  posts: PostRow[];
  feedError: string | null;
  viewer: ViewerGuildState | null;
  moderation: LiveGuildModerationState | null;
}

type LoadState = 'loading' | 'ready' | 'missing' | 'error';
type GuildFeedFilterId = 'all' | string;

function pendingJoinRequest(request: JoinRequest | null): boolean {
  return request?.status === 'pending';
}

export function LiveGuildPanel({
  groupId,
  initial = null,
  initialSheet = null,
}: {
  groupId: string;
  initial?: GuildPageData | null;
  initialSheet?: GuildShareSheetId | null;
}) {
  const router = useRouter();
  const {
    accountId,
    isConnected,
    isLoading: walletLoading,
    connect,
  } = useAppWallet();
  const { getClient } = useAppOnSocialClient();
  const [storageSheetOpen, setStorageSheetOpen] = useState(false);
  const [storageRefreshKey, setStorageRefreshKey] = useState(0);
  const userStorage = useUserStorageBalance(
    accountId,
    isConnected,
    storageRefreshKey
  );
  const { setTxResult, trackTransaction } = useAppTransactionFeedback();
  const [loadState, setLoadState] = useState<LoadState>(() =>
    initial ? 'ready' : 'loading'
  );
  const [state, setState] = useState<LiveGuildState>(() =>
    initial
      ? {
          config: initial.config,
          stats: initial.stats,
          indexedMemberCount: initial.indexedMemberCount,
          postCount: initial.postCount,
          members: initial.members,
          posts: initial.posts,
          feedError: null,
          viewer: null,
          moderation: null,
        }
      : {
          config: null,
          stats: null,
          indexedMemberCount: null,
          postCount: null,
          members: [],
          posts: [],
          feedError: null,
          viewer: null,
          moderation: null,
        }
  );
  const structureHydratedRef = useRef(Boolean(initial?.structureResolved));
  const structureRetryTimersRef = useRef<number[]>([]);
  /** Skip one auto feed refresh when SSR already painted the default feed. */
  const skipSsrFeedRefreshRef = useRef(
    Boolean(initial && initial.posts != null)
  );
  const configRef = useRef<GuildConfigSnapshot | null>(initial?.config ?? null);
  const [localPosts, setLocalPosts] = useState<PostRow[]>([]);
  const [hasMorePosts, setHasMorePosts] = useState(
    () => initial?.hasMorePosts ?? false
  );
  const [loadingMore, setLoadingMore] = useState(false);
  const [isFeedRefreshing, setIsFeedRefreshing] = useState(false);
  const [actionPendingLocal, setActionPendingLocal] = useState(false);
  const actionPendingShared = useGuildMembershipActionPending(
    accountId,
    groupId
  );
  const actionPending = actionPendingLocal || actionPendingShared;
  const [composerSpaceId, setComposerSpaceId] = useState('general');
  const [selectedFeedFilterId, setSelectedFeedFilterId] =
    useState<GuildFeedFilterId>('all');
  const [composer, setComposer] = useState<{
    mode: GuildComposerMode;
    target: PostRow | null;
    initialText?: string;
    initialFiles?: File[];
  } | null>(null);
  const [modalPending, setModalPending] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [optimisticJoinPending, setOptimisticJoinPending] = useState(false);
  const [headerElevated, setHeaderElevated] = useState(false);
  const [shellPreview, setShellPreview] = useState<GuildShellCacheEntry | null>(
    () => initial?.shell ?? readGuildShellCache(groupId) ?? null
  );
  const [shellExtrasResolved, setShellExtrasResolved] = useState(() =>
    Boolean(initial)
  );
  /** ACL resolved — separate from shell paint so join/leave never guess. */
  const [viewerAccessResolved, setViewerAccessResolved] = useState(false);
  const [feedPending, setFeedPending] = useState(() => !initial);
  const ssrGroupIdRef = useRef(initial ? groupId : null);
  const [confirmingLeave, setConfirmingLeave] = useState(false);
  const [manageSheet, setManageSheet] = useState<GuildManageSheetId | null>(
    () => initialSheet
  );
  const [settingsSheetOpen, setSettingsSheetOpen] = useState(false);
  const [groupStorageSheetOpen, setGroupStorageSheetOpen] = useState(false);
  const [groupStorageRecipient, setGroupStorageRecipient] = useState<
    string | null
  >(null);
  const [editSheetOpen, setEditSheetOpen] = useState(false);
  const [roomsSheetOpen, setRoomsSheetOpen] = useState(false);
  const [factsSheetOpen, setFactsSheetOpen] = useState(false);
  const settingsNextRef = useRef<'edit' | 'rooms' | 'storage' | null>(null);
  const factsNextRef = useRef<'members' | null>(null);
  const [addSpaceOpen, setAddSpaceOpen] = useState(false);
  const [writersTarget, setWritersTarget] = useState<{
    spaceId: string;
    spaceTitle: string;
    canEdit: boolean;
  } | null>(null);
  const [allowlistSpaceIds, setAllowlistSpaceIds] = useState<
    ReadonlySet<string>
  >(() => new Set());
  const hasLoadedRef = useRef(Boolean(initial));
  const reconcileTimersRef = useRef<number[]>([]);
  const confirmLeaveTimerRef = useRef<number | null>(null);
  const scrollRootRef = useRef<HTMLElement | null>(null);
  const heroTitleRef = useRef<HTMLHeadingElement | null>(null);
  const loadMoreRef = useRef<HTMLDivElement | null>(null);
  const loadMoreInFlightRef = useRef(false);

  const openManageSheet = useCallback(
    (sheet: GuildManageSheetId | null) => {
      setManageSheet(sheet);
      const shareable =
        sheet === 'proposals' || sheet === 'members' || sheet === 'requests'
          ? sheet
          : null;
      router.replace(
        shareable ? guildSheetPath(groupId, shareable) : guildPath(groupId),
        { scroll: false }
      );
    },
    [groupId, router]
  );

  useEffect(() => {
    if (initialSheet) setManageSheet(initialSheet);
  }, [initialSheet]);

  const config = state.config;
  configRef.current = config;
  const viewer = state.viewer;
  const joinRequestPending = pendingJoinRequest(viewer?.joinRequest ?? null);
  const joinProposalPending = Boolean(viewer?.pendingJoinProposalId);
  const joinPending =
    joinRequestPending || joinProposalPending || optimisticJoinPending;
  const joinCancelReady = joinRequestPending || joinProposalPending;
  const needsCollaborativeStorage = collaborativeJoinNeedsStorage({
    memberDriven: config?.memberDriven ?? false,
    isMember: viewer?.isMember ?? false,
    joinPending,
    availableYocto: userStorage.summary?.availableYocto,
  });
  const canManageGuild = Boolean(
    viewer?.isOwner || viewer?.isAdmin || viewer?.canModerate
  );
  const canAddMember = Boolean(viewer?.isOwner || viewer?.isAdmin);
  const showManageMenu = Boolean(viewer?.isMember);
  const resolvedDisplayName = config
    ? guildDisplayName(config.name, groupId)
    : shellPreview
      ? guildDisplayName(shellPreview.name, groupId)
      : null;
  // Always the real name when known — heading is hidden until elevate (no "Guild" flash).
  const title = resolvedDisplayName ?? 'Guild';
  // Auto-hide only while sticky under elevated chrome — stay visible at top of page.
  // Unscoped listener — same path as the bottom dock (body scroller via capture).
  const feedFiltersHidden = useDockAutoHide(!headerElevated);
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
  const feedSpaces = useMemo(
    () => (config ? enabledGuildSpaces(config.structure) : []),
    [config]
  );
  const channelTitleById = useMemo(() => {
    const titles: Record<string, string> = {};
    for (const space of feedSpaces) {
      titles[space.id] = space.title;
      titles[guildSpaceFeedChannel(space)] = space.title;
    }
    return titles;
  }, [feedSpaces]);
  const postableSpaces = useMemo(
    () => (config ? composerGuildSpaces(config.structure, viewerAccess) : []),
    [config, viewerAccess]
  );
  const selectedFeedSpace =
    selectedFeedFilterId === 'all' || !config
      ? null
      : guildSpaceById(config.structure, selectedFeedFilterId);
  const composerSpace = useMemo(() => {
    if (!config) return null;
    const selected = guildSpaceById(config.structure, composerSpaceId);
    if (selected && canPostToGuildSpace(selected, viewerAccess)) {
      return selected;
    }
    return defaultComposerSpace(config.structure, viewerAccess);
  }, [composerSpaceId, config, viewerAccess]);
  const canPostInChannel = useCallback(
    (channel: string | null | undefined) =>
      config
        ? canViewerPostInChannel(config.structure, channel, viewerAccess)
        : false,
    [config, viewerAccess]
  );
  // Pen only when the open feed room is writable (or All and at least one room is).
  const canCompose = useMemo(() => {
    if (!viewerAccess.isMember || postableSpaces.length === 0) return false;
    if (selectedFeedFilterId === 'all' || !selectedFeedSpace) return true;
    return canPostToGuildSpace(selectedFeedSpace, viewerAccess);
  }, [
    postableSpaces.length,
    selectedFeedFilterId,
    selectedFeedSpace,
    viewerAccess,
  ]);
  const feedPosts = useMemo(() => {
    const indexedKeys = new Set(state.posts.map(postKey));
    const pendingLocal = localPosts.filter(
      (post) =>
        !indexedKeys.has(postKey(post)) &&
        (!selectedFeedSpace ||
          guildSpaceMatchesPostChannel(selectedFeedSpace, post.channel))
    );
    return [...pendingLocal, ...state.posts];
  }, [state.posts, localPosts, selectedFeedSpace]);

  useEffect(() => {
    if (!config) return;
    const defaultSpace = defaultComposerSpace(config.structure, viewerAccess);
    if (!defaultSpace) return;
    if (!postableSpaces.some((space) => space.id === composerSpaceId)) {
      setComposerSpaceId(defaultSpace.id);
    }
  }, [composerSpaceId, config, postableSpaces, viewerAccess]);

  // Feed tab picks the default room for the composer and modal dropdown.
  useEffect(() => {
    if (selectedFeedFilterId === 'all' || !config) return;
    const space = guildSpaceById(config.structure, selectedFeedFilterId);
    if (!space || !postableSpaces.some((item) => item.id === space.id)) {
      return;
    }
    setComposerSpaceId(space.id);
  }, [selectedFeedFilterId, config, postableSpaces]);
  const feedBlocks = useMemo(() => coalesceFeedThreads(feedPosts), [feedPosts]);
  const quotedPosts = useQuotedPosts(feedPosts);
  // Confirmed-ledger facepile: the viewer knows they are a member before the
  // indexer does, so seed the stack with their own avatar until stats catch up.
  const facepileIds = useMemo(
    () =>
      buildGuildFacepileIds(
        state.members.map((member) => member.memberId),
        { viewerId: accountId, viewerIsMember: viewer?.isMember }
      ),
    [accountId, state.members, viewer?.isMember]
  );
  const viewerJoinedAt = useMemo(() => {
    if (!accountId || !viewer?.isMember) return null;
    return (
      state.members.find((member) => member.memberId === accountId)
        ?.blockTimestamp ?? null
    );
  }, [accountId, state.members, viewer?.isMember]);
  const postAuthorIds = useMemo(
    () => [
      ...feedPosts.map((post) => post.accountId),
      ...Object.values(quotedPosts).map((post) => post.accountId),
      ...facepileIds,
    ],
    [feedPosts, quotedPosts, facepileIds]
  );
  const postAuthorProfiles = usePostAuthorProfiles(postAuthorIds);
  seedScarceEmbedsFromSsr(initial?.scarceEmbeds);
  const {
    engagement,
    toggleReaction,
    toggleSave,
    isReactionPending,
    isSavePending,
    isSharePending,
    withSharePending,
    confirmAmplify,
    confirmRepost,
    confirmUnrepost,
  } = usePostEngagement(
    // Repost rows render (and act on) the original post — fetch its stats too.
    useMemo(
      () => withRepostOriginals(feedPosts, quotedPosts),
      [feedPosts, quotedPosts]
    ),
    {
      initial: initial?.engagement ?? null,
      onError: (message) => setTxResult({ type: 'error', msg: message }),
    }
  );
  const { pollTallyFor, castVote, isPollVotePending } = usePollVotes(
    feedPosts,
    {
      onError: (message) => setTxResult({ type: 'error', msg: message }),
    }
  );

  // Soft-fill scarce CTAs when the feed changes (space filter / refresh).
  useEffect(() => {
    if (feedPosts.length === 0) return;
    const client = createReadOnlyOnSocialClient();
    let cancelled = false;
    void hydrateScarceEmbedsForPosts(client, feedPosts).then((map) => {
      if (!cancelled) seedScarceEmbedsFromSsr(map);
    });
    return () => {
      cancelled = true;
    };
  }, [feedPosts]);

  const refreshFeed = useCallback(async () => {
    setIsFeedRefreshing(true);
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

      const fetchedPosts = feedResult.items ?? [];
      const indexedKeys = new Set(fetchedPosts.map(postKey));
      setLocalPosts((current) => {
        const next = current.filter((post) => !indexedKeys.has(postKey(post)));
        revokeDroppedOptimisticMedia(current, next);
        return next;
      });
      setState((current) => ({
        ...current,
        posts: fetchedPosts,
        feedError: null,
      }));
      setHasMorePosts(feedResult.nextOffset !== undefined);
    } catch (cause) {
      setState((current) => ({
        ...current,
        feedError:
          cause instanceof Error
            ? cause.message
            : 'Could not load guild posts.',
      }));
    } finally {
      setIsFeedRefreshing(false);
    }
  }, [groupId, selectedFeedSpace]);

  const applyViewerAccess = useCallback(
    async (
      client: ReturnType<typeof createReadOnlyOnSocialClient>,
      normalizedConfig: GuildConfigSnapshot
    ) => {
      if (!accountId) {
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
        if (membership) {
          writeGuildMembershipCache(accountId, groupId, {
            isMember: true,
            joinPending: false,
          });
        }
      } catch {
        // Cache hint is best-effort.
      }

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
      writeGuildShellCache(groupId, shellEntry);
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
        members: reconcileGuildMemberRoster(
          membersResult.items ?? [],
          fromIndexer.ownerId
        ),
        posts: feedResult.items ?? [],
        feedError: null,
      }));
      setHasMorePosts(feedResult.nextOffset !== undefined);
      setLoadState('ready');
    }

    let normalizedConfig: GuildConfigSnapshot | null = indexed
      ? guildConfigFromIndexedRow(groupId, indexed)
      : null;

    try {
      const rawConfig = await client.groups.getConfig(groupId);
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

    if (!normalizedConfig && !indexed) {
      setState({
        config: null,
        stats: null,
        indexedMemberCount: null,
        postCount: null,
        members: [],
        posts: [],
        feedError: null,
        viewer: null,
        moderation: null,
      });
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
        setState((current) => ({ ...current, stats }));
      })
      .catch(() => {});

    await applyViewerAccess(client, normalizedConfig);
    return true;
  }, [accountId, applyViewerAccess, clearStructureRetryTimers, groupId]);

  const refresh = useCallback(async () => {
    if (hasLoadedRef.current) {
      setIsFeedRefreshing(true);
    } else {
      setLoadState('loading');
    }
    setError(null);
    setFeedPending(true);

    try {
      const feedPromise = refreshFeed().finally(() => setFeedPending(false));
      const shellReady = await refreshShell();
      if (!shellReady) {
        hasLoadedRef.current = true;
        await feedPromise;
        return;
      }
      await feedPromise;
      hasLoadedRef.current = true;
    } catch (cause) {
      if (!hasLoadedRef.current) {
        setLoadState('error');
      }
      setError(
        cause instanceof Error ? cause.message : 'Could not load guild.'
      );
    } finally {
      setIsFeedRefreshing(false);
    }
  }, [refreshFeed, refreshShell]);

  useEffect(() => {
    clearStructureRetryTimers();
    // Keep SSR shell for the seeded guild; wipe only on client navigation.
    if (ssrGroupIdRef.current === groupId && initial) {
      writeGuildShellCache(groupId, initial.shell);
      setShellPreview(initial.shell);
      setShellExtrasResolved(true);
      setViewerAccessResolved(false);
      setFeedPending(false);
      setHasMorePosts(initial.hasMorePosts);
      setLoadState('ready');
      structureHydratedRef.current = Boolean(initial.structureResolved);
      skipSsrFeedRefreshRef.current = true;
      setState({
        config: initial.config,
        stats: initial.stats,
        indexedMemberCount: initial.indexedMemberCount,
        postCount: initial.postCount,
        members: initial.members,
        posts: initial.posts,
        feedError: null,
        viewer: null,
        moderation: null,
      });
      hasLoadedRef.current = true;
      return;
    }
    ssrGroupIdRef.current = null;
    structureHydratedRef.current = false;
    skipSsrFeedRefreshRef.current = false;
    setShellPreview(readGuildShellCache(groupId) ?? null);
    setShellExtrasResolved(false);
    setViewerAccessResolved(false);
    setHeaderElevated(false);
    setFeedPending(true);
    setLocalPosts([]);
    setLoadState('loading');
    setState((current) => ({
      ...current,
      posts: [],
      feedError: null,
      // Avoid painting the previous guild's membership on the new shell.
      config: null,
      stats: null,
      indexedMemberCount: null,
      postCount: null,
      members: [],
      viewer: null,
      moderation: null,
    }));
    setAllowlistSpaceIds(new Set());
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
    hasLoadedRef.current = false;
    void refresh();
    // Shell + feed load is scoped to guild/account changes; tab switches use refreshFeed.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- refreshFeed intentionally excluded
  }, [accountId, groupId, walletLoading, initial]);

  useEffect(() => {
    if (walletLoading || !hasLoadedRef.current) return;
    // Soft SSR already seeded the default "all" feed — skip the duplicate
    // keyed query. Filter changes and later mounts still refresh.
    if (
      skipSsrFeedRefreshRef.current &&
      selectedFeedFilterId === 'all' &&
      ssrGroupIdRef.current === groupId
    ) {
      skipSsrFeedRefreshRef.current = false;
      return;
    }
    skipSsrFeedRefreshRef.current = false;
    void refreshFeed();
  }, [refreshFeed, selectedFeedFilterId, walletLoading, groupId]);

  useEffect(() => {
    if (viewer?.pendingJoinProposalId || viewer?.isMember) {
      setOptimisticJoinPending(false);
    }
  }, [viewer?.isMember, viewer?.pendingJoinProposalId]);

  useEffect(() => {
    const scrollRoot = scrollRootRef.current;
    const canElevate =
      loadState === 'ready' ||
      (loadState === 'loading' && Boolean(shellPreview));
    if (!scrollRoot || !canElevate) return;

    // Title handoff: elevate once the hero name scrolls under the immersive bar.
    const heroTitle = heroTitleRef.current;
    const header = scrollRoot.parentElement?.querySelector(
      '.os-app-screen-header'
    );

    const screen = scrollRoot.closest<HTMLElement>('.os-app-screen') ?? null;
    const railPin = scrollRoot.querySelector('.guild-feed-filter-pin');

    const syncElevated = () => {
      const scrolled = scrollRoot.scrollTop > 8;
      if (!heroTitle) {
        setHeaderElevated(scrollRoot.scrollTop > 18);
        return;
      }
      const headerBottom =
        header?.getBoundingClientRect().bottom ??
        scrollRoot.getBoundingClientRect().top + 72;
      const heroRect = heroTitle.getBoundingClientRect();
      const titleTop = heroRect.top;

      // Guard: if the hero hasn't laid out yet (height 0), leave handoff at
      // the default (0) so the hero name stays visible on first paint.
      if (heroRect.height > 0) {
        const fadeZone = 28;
        const distance = titleTop - headerBottom;
        const t = Math.max(0, Math.min(1, 1 - distance / fadeZone));
        screen?.style.setProperty('--title-handoff', String(t));
      }

      // Rail reveal: the chrome glass starts at nav height and grows down to
      // meet the chips strip over its final approach, docking flush (0 → 1).
      if (railPin) {
        const pinRect = railPin.getBoundingClientRect();
        if (pinRect.height > 0) {
          const approach = pinRect.height;
          const p = Math.max(
            0,
            Math.min(1, (headerBottom + approach - pinRect.top) / approach)
          );
          screen?.style.setProperty('--os-rail-reveal', String(p));
        }
      }

      setHeaderElevated((current) => {
        if (current) {
          return scrolled && titleTop < headerBottom + 2;
        }
        return scrolled && titleTop < headerBottom - 4;
      });
    };

    syncElevated();
    scrollRoot.addEventListener('scroll', syncElevated, { passive: true });
    window.addEventListener('resize', syncElevated, { passive: true });
    return () => {
      scrollRoot.removeEventListener('scroll', syncElevated);
      window.removeEventListener('resize', syncElevated);
      screen?.style.removeProperty('--title-handoff');
      screen?.style.removeProperty('--os-rail-reveal');
    };
  }, [loadState, shellPreview?.name]);

  useEffect(() => {
    const timers = reconcileTimersRef.current;
    return () => {
      for (const timer of timers) window.clearTimeout(timer);
      if (confirmLeaveTimerRef.current !== null) {
        window.clearTimeout(confirmLeaveTimerRef.current);
      }
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
        setState((current) => ({
          ...current,
          posts: [...current.posts, ...(page.items ?? [])],
        }));
        setHasMorePosts(page.nextOffset !== undefined);
      } catch {
        // Keep the current list; the sentinel stays available to retry.
      } finally {
        loadMoreInFlightRef.current = false;
        setLoadingMore(false);
      }
    })();
  }, [groupId, hasMorePosts, selectedFeedSpace, state.posts.length]);

  useInfiniteScrollSentinel({
    scrollRootRef,
    sentinelRef: loadMoreRef,
    enabled: hasMorePosts && state.posts.length > 0,
    onIntersect: loadMoreFeed,
  });

  // Never show a count the viewer knows is stale (e.g. "0 members" while the
  // member-only Leave action is visible) — trust the confirmed facepile.
  const memberCount =
    resolveGuildMemberCount({
      chainStats: state.stats,
      indexedCount: state.indexedMemberCount,
      rosterFloor: facepileIds.length,
    }) ?? 0;
  const membershipHint = accountId
    ? (readGuildMembershipCache(accountId, groupId) ?? null)
    : null;
  const membershipChromePending =
    walletLoading ||
    (isConnected &&
      Boolean(accountId) &&
      !viewerAccessResolved &&
      membershipHint == null);
  const effectiveIsMember = viewerAccessResolved
    ? Boolean(viewer?.isMember)
    : Boolean(membershipHint?.isMember);
  const effectiveJoinPending = viewerAccessResolved
    ? joinPending
    : Boolean(membershipHint?.joinPending);
  const effectiveIsOwner = viewerAccessResolved
    ? Boolean(viewer?.isOwner)
    : false;
  const effectiveIsBlacklisted = viewerAccessResolved
    ? Boolean(viewer?.isBlacklisted)
    : false;
  // Mutations require ACL; hint is label-only until viewerAccessResolved.
  // Keep ready through Leave?/Transfer? confirm — danger mutes when !ready.
  const membershipActionReady = !viewerAccessResolved
    ? !isConnected
    : effectiveIsMember
      ? true
      : effectiveIsBlacklisted
        ? false
        : effectiveJoinPending
          ? joinCancelReady
          : Boolean(config) && !effectiveIsMember;
  const actionLabel = useMemo(
    () =>
      guildMembershipJoinLabel({
        isConnected,
        accessGated: Boolean(config?.accessGated),
        joinPending: effectiveJoinPending,
        joinCancelReady,
        isMember: effectiveIsMember,
        isOwner: effectiveIsOwner,
        isBlacklisted: effectiveIsBlacklisted,
        confirmingLeave,
        needsStorage: needsCollaborativeStorage,
        loadGuild: !config,
        hintMember: !viewerAccessResolved && Boolean(membershipHint?.isMember),
        hintJoinPending:
          !viewerAccessResolved && Boolean(membershipHint?.joinPending),
      }),
    [
      config,
      confirmingLeave,
      effectiveIsBlacklisted,
      effectiveIsMember,
      effectiveIsOwner,
      effectiveJoinPending,
      isConnected,
      joinCancelReady,
      membershipHint,
      needsCollaborativeStorage,
      viewerAccessResolved,
    ]
  );

  const clearConfirmLeave = () => {
    if (confirmLeaveTimerRef.current !== null) {
      window.clearTimeout(confirmLeaveTimerRef.current);
      confirmLeaveTimerRef.current = null;
    }
    setConfirmingLeave(false);
  };

  const runMembershipAction = async () => {
    setError(null);

    if (!isConnected) {
      await connect();
      return;
    }

    if (!config) return;
    // Never join/leave from a guessed label — wait for ACL (hint is display-only).
    if (!viewerAccessResolved) return;
    if (effectiveIsBlacklisted) return;

    if (effectiveIsMember && effectiveIsOwner) {
      openManageSheet('members');
      return;
    }

    setActionPendingLocal(true);
    setGuildMembershipActionPending(accountId, groupId, true);
    try {
      const { client } = await getClient();
      const response = effectiveIsMember
        ? await client.groups.leave(groupId)
        : effectiveJoinPending
          ? config.memberDriven && viewer?.pendingJoinProposalId
            ? await client.groups.cancelProposal(
                groupId,
                viewer.pendingJoinProposalId
              )
            : await client.groups.cancelJoin(groupId)
          : await client.groups.join(groupId);

      const txHashes = collectRelayTxHashes(response);
      const confirmed = await trackTransaction({
        txHashes,
        submittedMessage: effectiveIsMember
          ? txToastConfirming.leavingGuild
          : effectiveJoinPending
            ? txToastConfirming.cancelingGuildRequest
            : config.accessGated
              ? txToastConfirming.requestingGuildAccess
              : txToastConfirming.joiningGuild,
        successMessage: effectiveIsMember
          ? txToastSuccess.guildLeft
          : effectiveJoinPending
            ? txToastSuccess.guildRequestCanceled
            : config.accessGated
              ? txToastSuccess.guildAccessRequested
              : txToastSuccess.guildJoined,
        failureMessage: txToastError.guildMembershipFailed,
      });

      if (confirmed) {
        if (accountId) {
          writeGuildMembershipCache(accountId, groupId, {
            isMember: effectiveIsMember
              ? false
              : effectiveJoinPending
                ? false
                : !config.accessGated,
            joinPending: effectiveIsMember
              ? false
              : effectiveJoinPending
                ? false
                : config.accessGated,
          });
        }
        if (
          config.memberDriven &&
          !effectiveIsMember &&
          !effectiveJoinPending
        ) {
          setOptimisticJoinPending(true);
        } else if (effectiveJoinPending) {
          setOptimisticJoinPending(false);
        }
        await refresh();
      }
    } catch (cause) {
      if (isWalletUserCancellation(cause)) return;
      setError(
        cause instanceof Error
          ? cause.message
          : 'Could not update guild membership.'
      );
    } finally {
      setActionPendingLocal(false);
      setGuildMembershipActionPending(accountId, groupId, false);
    }
  };

  /**
   * Leave / transfer ownership are destructive — require a second tap.
   * Owners cannot leave on-chain; confirm opens members to transfer first.
   */
  const handleMembershipClick = () => {
    if (needsCollaborativeStorage) {
      setStorageSheetOpen(true);
      return;
    }
    if (effectiveIsBlacklisted) {
      return;
    }
    if (effectiveJoinPending && !joinCancelReady) {
      return;
    }
    if (isConnected && !viewerAccessResolved) {
      return;
    }
    if (effectiveIsMember && !confirmingLeave) {
      setConfirmingLeave(true);
      confirmLeaveTimerRef.current = window.setTimeout(() => {
        confirmLeaveTimerRef.current = null;
        setConfirmingLeave(false);
      }, 4_000);
      return;
    }
    clearConfirmLeave();
    if (effectiveIsMember && effectiveIsOwner) {
      openManageSheet('members');
      return;
    }
    void runMembershipAction();
  };

  const openComposerModal = (mode: GuildComposerMode) => (target: PostRow) => {
    setModalError(null);
    setComposer({ mode, target });
  };

  const openPostComposer = useCallback(() => {
    setModalError(null);
    setComposer({ mode: 'post', target: null });
  }, []);

  // Launcher pen is the only compose entry — no floating dock duplicate.
  useRegisterComposeAction(canCompose ? openPostComposer : null);

  useEffect(() => {
    return subscribeGuildPostConfirmed(({ groupId: postedGroupId, post }) => {
      if (postedGroupId !== groupId) return;
      setLocalPosts((current) => {
        const key = postKey(post);
        if (current.some((row) => postKey(row) === key)) return current;
        return [post, ...current];
      });
      scheduleReconcile();
    });
  }, [groupId, scheduleReconcile]);

  const submitFromModal = async (payload: GuildComposerSubmit) => {
    if (!composer || modalPending) return;
    const { mode, target } = composer;
    const text = payload.text.trim();
    const files = payload.files ?? [];
    const drop =
      mode === 'post' && isDropComposeDraftReady(payload.drop)
        ? payload.drop!
        : null;
    if (!text && !files.length && !drop) return;
    if (mode !== 'post' && !target) return;

    if (mode !== 'post' && target) {
      const threadChannel = target.channel ?? composerSpace?.id ?? null;
      if (!canPostInChannel(threadChannel)) {
        setModalError('You cannot reply in this room.');
        return;
      }
    }

    if (!isConnected || !accountId) {
      await connect();
      return;
    }

    const pollEmbed =
      mode === 'post' && payload.poll && !drop
        ? {
            kind: 'poll' as const,
            question: text,
            options: payload.poll.options,
            ...(payload.poll.durationMs != null
              ? { closesAt: Date.now() + payload.poll.durationMs }
              : {}),
          }
        : null;
    const commerceEmbed = drop ? commerceEmbedFromDraft(drop) : null;
    const dropKind = dropPostKind(drop);
    const bodyText = resolvedDropPostText(text, drop);
    const contentLabels = normalizeComposerContentLabels(payload);

    setModalError(null);
    setModalPending(true);
    try {
      const newPostId = Date.now().toString();
      const { client } = await getClient();
      const filePayload = files.length ? { files } : {};
      const media = files.length
        ? buildOptimisticMediaEntries(files)
        : undefined;
      const mediaKind =
        !pollEmbed && !drop && files.length
          ? mediaKindFromFile(files[0]!)
          : undefined;
      const tagPayload = {
        ...postMetaFromText(bodyText),
        ...placesMetaFromComposer(payload.places),
      };

      let response: unknown;
      if (mode === 'post') {
        if (!composerSpace) {
          throw new Error('Choose a room before posting.');
        }
        response = await client.groups.post(
          groupId,
          {
            text: bodyText,
            access: 'group',
            groupId,
            channel: guildSpaceFeedChannel(composerSpace),
            audiences: [composerSpace.audience],
            timestamp: Date.now(),
            ...tagPayload,
            ...(pollEmbed
              ? { embeds: [pollEmbed] }
              : commerceEmbed
                ? {
                    embeds: [commerceEmbed],
                    x: dropSnapshotExtra(drop!),
                    kind: dropKind ?? composerSpace.kind,
                  }
                : mediaKind
                  ? { kind: mediaKind }
                  : { kind: composerSpace.kind }),
            ...contentLabels,
            ...filePayload,
          },
          newPostId
        );
      } else {
        const ref = {
          author: target!.accountId,
          groupId,
          postId: target!.postId,
        };
        const feedMeta = applyMediaKindOverride(
          inheritedGuildReplyFeedMeta(target!, {
            fallbackChannel: composerSpace
              ? guildSpaceFeedChannel(composerSpace)
              : null,
            fallbackKind: composerSpace?.kind ?? null,
            fallbackAudiences: composerSpace
              ? [composerSpace.audience]
              : undefined,
          }),
          files
        );
        const postData = {
          text,
          access: 'group' as const,
          groupId,
          timestamp: Date.now(),
          ...tagPayload,
          ...feedMeta,
          ...contentLabels,
          ...filePayload,
        };
        response =
          mode === 'quote'
            ? await client.groups.quotePost(groupId, ref, postData, newPostId)
            : await client.groups.replyToPost(
                groupId,
                ref,
                postData,
                newPostId
              );
      }

      const confirmed = await trackTransaction({
        txHashes: collectRelayTxHashes(response),
        submittedMessage:
          mode === 'quote'
            ? txToastConfirming.quotingGuildPost
            : txToastConfirming.postingToGuild,
        successMessage:
          mode === 'quote'
            ? txToastSuccess.guildQuotePublished
            : txToastSuccess.guildPostPublished,
        failureMessage:
          mode === 'quote'
            ? txToastError.guildQuoteFailed
            : txToastError.guildPostFailed,
      });

      if (confirmed) {
        const replyFeedMeta =
          mode === 'post' || !target
            ? null
            : applyMediaKindOverride(
                inheritedGuildReplyFeedMeta(target, {
                  fallbackChannel: composerSpace
                    ? guildSpaceFeedChannel(composerSpace)
                    : null,
                  fallbackKind: composerSpace?.kind ?? null,
                  fallbackAudiences: composerSpace
                    ? [composerSpace.audience]
                    : undefined,
                }),
                files
              );
        // Chain-confirmed; show at the top while the indexer catches up.
        setLocalPosts((current) => [
          {
            accountId,
            postId: newPostId,
            value: JSON.stringify({
              v: 1,
              text: bodyText,
              ...tagPayload,
              ...(pollEmbed
                ? { embeds: [pollEmbed] }
                : commerceEmbed
                  ? {
                      embeds: [commerceEmbed],
                      x: dropSnapshotExtra(drop!),
                    }
                  : {}),
              ...(media ? { media } : {}),
              ...contentLabels,
            }),
            blockHeight: 0,
            blockTimestamp: Date.now(),
            groupId,
            isGroupContent: true,
            ...(mode === 'post' && composerSpace
              ? {
                  channel: guildSpaceFeedChannel(composerSpace),
                  kind: pollEmbed
                    ? 'poll'
                    : (dropKind ?? mediaKind ?? composerSpace.kind),
                }
              : mode === 'quote'
                ? {
                    refAuthor: target!.accountId,
                    refPath: postContentPath(target!),
                    refType: 'post',
                    ...replyFeedMeta,
                  }
                : {
                    parentAuthor: target!.accountId,
                    parentPath: postContentPath(target!),
                    parentType: 'post',
                    ...replyFeedMeta,
                  }),
          },
          ...current,
        ]);
        scheduleReconcile();
        if (mode === 'reply' && target) {
          clearWriteDockDraft(writeDockDraftKey('post', postKey(target)));
        }
        setComposer(null);
      }
    } catch (cause) {
      if (isWalletUserCancellation(cause)) return;
      setModalError(
        cause instanceof Error
          ? cause.message
          : mode === 'quote'
            ? 'Could not quote this post.'
            : mode === 'reply'
              ? 'Could not reply to this post.'
              : 'Could not post to guild.'
      );
    } finally {
      setModalPending(false);
    }
  };

  const openFullReply = (target: PostRow, draft?: WriteDockSubmit) => {
    const channel =
      target.channel ??
      (composerSpace ? guildSpaceFeedChannel(composerSpace) : null);
    if (!canPostInChannel(channel)) return;
    setModalError(null);
    const seed = writeDockExpandSeed(
      writeDockDraftKey('post', postKey(target)),
      { text: draft?.text ?? '', files: draft?.files ?? [] }
    );
    setComposer({
      mode: 'reply',
      target,
      initialText: seed.initialText,
      initialFiles: seed.initialFiles,
    });
  };

  const { startReply, clearReply } = useFeedReplyWriteDock({
    enabled: Boolean(canCompose),
    sheetOpen: Boolean(composer),
    authorNameFor: (accountId) =>
      postAuthorProfiles[accountId]?.displayName,
    onExpand: openFullReply,
    onConfirmed: (reply) => {
      setLocalPosts((current) => {
        if (current.some((row) => postKey(row) === postKey(reply))) {
          return current;
        }
        return [reply, ...current];
      });
      scheduleReconcile();
    },
  });

  const replyHandler = canCompose
    ? (post: PostRow) => {
        const channel =
          post.channel ??
          (composerSpace ? guildSpaceFeedChannel(composerSpace) : null);
        if (!canPostInChannel(channel)) return;
        startReply(post);
      }
    : undefined;
  const quoteHandler =
    viewer?.isMember && config
      ? (post: PostRow) => {
          const channel =
            post.channel ??
            (composerSpace ? guildSpaceFeedChannel(composerSpace) : null);
          if (!canPostInChannel(channel)) return;
          clearReply();
          openComposerModal('quote')(post);
        }
      : undefined;
  const repostHandler =
    viewer?.isMember && config
      ? (post: PostRow) => {
          const channel =
            post.channel ??
            (composerSpace ? guildSpaceFeedChannel(composerSpace) : null);
          if (!canPostInChannel(channel)) return;
          void withSharePending(post, async () => {
            if (!accountId) return;
            try {
              const { client } = await getClient();
              const result = await submitPersonalRepost({
                client,
                accountId,
                target: post,
                trackTransaction,
              });
              if (result.confirmed && result.optimisticPost) {
                confirmRepost(post, {
                  postId: result.optimisticPost.postId,
                  groupId: result.optimisticPost.groupId,
                });
              }
            } catch {
              // toast via trackTransaction
            }
          });
        }
      : undefined;
  const undoRepostHandler =
    viewer?.isMember && config
      ? (post: PostRow) => {
          const viewerRow = engagement[postKey(post)];
          const viewerRepostId = viewerRow?.viewerRepostId;
          if (!accountId || !viewerRepostId) return;
          void withSharePending(post, async () => {
            try {
              const { client } = await getClient();
              const result = await submitPersonalUnrepost({
                client,
                accountId,
                target: post,
                viewerRepost: {
                  postId: viewerRepostId,
                  groupId: viewerRow.viewerRepostGroupId,
                },
                trackTransaction,
              });
              if (result.confirmed) confirmUnrepost(post);
            } catch {
              // toast via trackTransaction
            }
          });
        }
      : undefined;

  const renderFeedFilters = () => (
    <GuildFeedFilterList
      groupId={groupId}
      selectedFeedFilterId={selectedFeedFilterId}
      onSelectFeedFilter={setSelectedFeedFilterId}
      feedSpaces={feedSpaces}
      canAddMember={canAddMember}
      onAddSpace={() => setAddSpaceOpen(true)}
      viewer={viewerAccess}
      onOpenWriters={(space) =>
        setWritersTarget({
          spaceId: space.id,
          spaceTitle: space.title,
          canEdit: canAddMember,
        })
      }
      pinned={
        loadState === 'ready' ||
        (loadState === 'loading' && Boolean(shellPreview))
      }
      scrollHidden={headerElevated && feedFiltersHidden}
    />
  );

  return (
    <OsAppScreen
      title={title}
      // Hero owns the name; nav title appears when it scrolls under (no morph).
      // Loading stays title-only — no marketing subtitle / raw groupId flash.
      dockBack
      backFallbackHref="/groups"
      actions={
        loadState === 'ready' &&
        config &&
        (showManageMenu || canManageGuild) ? (
          <>
            {showManageMenu ? (
              <GuildManageMenu
                pendingRequestCount={
                  state.moderation?.pendingMemberRequestCount ?? 0
                }
                memberCount={memberCount}
                activeProposalCount={state.moderation?.activeProposalCount ?? 0}
                accessGated={config.accessGated}
                memberDriven={config.memberDriven}
                canAddMember={canAddMember}
                canReviewRequests={canManageGuild}
                onOpenSheet={openManageSheet}
              />
            ) : null}
            {canManageGuild ? (
              <OsIconAction
                ariaLabel="Guild settings"
                onClick={() => setSettingsSheetOpen(true)}
              >
                <SettingsIcon className="glass-sheet-close-icon" aria-hidden />
              </OsIconAction>
            ) : null}
          </>
        ) : undefined
      }
      immersiveHeader={loadState === 'loading' || loadState === 'ready'}
      headerElevated={headerElevated}
      scrollRootRef={scrollRootRef}
    >
      {/* Viewport-anchored chrome glass — nav + room rail frost as one pane. */}
      <div
        aria-hidden
        className={`os-chrome-glass${headerElevated ? ' is-frosted' : ''}${
          headerElevated && feedFiltersHidden ? ' is-rail-hidden' : ''
        }`}
      />
      <div className="guilds-page">
        {loadState === 'loading' ? (
          <div
            className="guild-loading"
            aria-busy="true"
            aria-label="Loading guild"
          >
            {shellPreview ? (
              <section className="guild-hero">
                <div
                  className={guildHeroCoverClassName(shellPreview.bannerUrl)}
                  style={guildCoverStyle(shellPreview.bannerUrl, groupId)}
                  aria-hidden
                >
                  {shellPreview.bannerUrl ? (
                    <img src={shellPreview.bannerUrl} alt="" />
                  ) : null}
                </div>

                <div className="guild-hero-title-row">
                  {shellPreview.badgeUrl ? (
                    <span className="guild-hero-badge has-media" aria-hidden>
                      <img src={shellPreview.badgeUrl} alt="" />
                    </span>
                  ) : null}
                  <h2 ref={heroTitleRef}>
                    {guildDisplayName(shellPreview.name, groupId)}
                  </h2>
                </div>

                <div className="guild-hero-meta">
                  <div className="guild-hero-meta-main">
                    <span className="guild-hero-mode-row">
                      <span className="guild-hero-mode">
                        {guildAccessLabel(
                          shellPreview.accessGated,
                          shellPreview.memberDriven
                        )}
                      </span>
                    </span>
                  </div>
                </div>

                {shellPreview.topics.length > 0 ? (
                  <div className="guild-hero-tags" aria-label="Guild topics">
                    {shellPreview.topics.map((tag) => (
                      <span key={tag}>{topicLabel(tag) ?? tag}</span>
                    ))}
                  </div>
                ) : null}

                {shellPreview.description ? (
                  <GuildDescriptionClamp text={shellPreview.description} />
                ) : null}
              </section>
            ) : (
              <div className="guild-loading-hero" aria-hidden>
                <div className="guild-loading-cover standing-row-shimmer" />
                <div className="guild-loading-identity">
                  <div className="guild-loading-lines">
                    <div className="standing-row-shimmer guild-loading-line" />
                    <div className="standing-row-shimmer guild-loading-line-sm" />
                  </div>
                </div>
              </div>
            )}
            <PostRowSkeleton
              rows={3}
              showChannel={selectedFeedFilterId === 'all'}
            />
          </div>
        ) : null}

        {loadState === 'missing' ? (
          <section className="guild-hero-card">
            <p className="guild-eyebrow">Not found</p>
            <h2>We could not find this guild yet.</h2>
            <p>
              If it was just created, wait a moment and try again. Anyone can
              open this page once the guild is live.
            </p>
            <button
              className="guild-secondary-button"
              type="button"
              onClick={() => void refresh()}
            >
              Try again
            </button>
          </section>
        ) : null}

        {loadState === 'error' ? (
          <section className="guild-state-card is-error">
            <p>{error ?? 'Could not load guild.'}</p>
            <button
              className="guild-secondary-button"
              type="button"
              onClick={() => void refresh()}
            >
              Retry
            </button>
          </section>
        ) : null}

        {loadState === 'ready' && config ? (
          <>
            <section className="guild-hero">
              <div
                className={guildHeroCoverClassName(config.bannerUrl)}
                style={guildCoverStyle(config.bannerUrl, groupId)}
                aria-hidden
              >
                {config.bannerUrl ? (
                  <img src={config.bannerUrl} alt="" />
                ) : null}
              </div>

              <div className="guild-hero-title-row">
                {config.badgeUrl ? (
                  <span className="guild-hero-badge has-media" aria-hidden>
                    <img src={config.badgeUrl} alt="" />
                  </span>
                ) : null}
                <h2 ref={heroTitleRef}>{config.name}</h2>
              </div>

              <div className="guild-hero-meta">
                <div className="guild-hero-meta-main">
                  <GuildFacepile
                    memberIds={facepileIds}
                    profiles={postAuthorProfiles}
                    memberCount={memberCount}
                    loading={!shellExtrasResolved}
                    onClick={() => {
                      if (!shellExtrasResolved) return;
                      openManageSheet('members');
                    }}
                    disabled={!shellExtrasResolved}
                  />
                  <span className="guild-hero-mode-row">
                    <span className="guild-hero-mode">
                      {guildAccessLabel(
                        config.accessGated,
                        config.memberDriven
                      )}
                    </span>
                    <button
                      type="button"
                      className="guild-hero-facts-button"
                      aria-label="Guild facts"
                      onClick={() => setFactsSheetOpen(true)}
                    >
                      <InformationCircleIcon
                        className="guild-hero-facts-icon"
                        aria-hidden
                      />
                    </button>
                  </span>
                </div>
                <div className="guild-hero-membership-slot">
                  {membershipChromePending ? (
                    <span aria-busy="true" aria-label="Loading membership">
                      <span
                        className="standing-row-shimmer guild-hero-membership-shimmer"
                        aria-hidden
                      />
                    </span>
                  ) : (
                    <GuildMembershipJoinButton
                      className="guild-hero-membership"
                      label={actionLabel}
                      variant={confirmingLeave ? 'danger' : 'primary'}
                      active={effectiveIsMember && !confirmingLeave}
                      ready={
                        membershipActionReady && !needsCollaborativeStorage
                      }
                      pending={actionPending}
                      pendingLabel={guildMembershipJoinPendingLabel({
                        accessGated: Boolean(config?.accessGated),
                        canceling: effectiveJoinPending,
                        leaving: effectiveIsMember,
                      })}
                      disabled={
                        effectiveIsBlacklisted ||
                        (effectiveJoinPending && !joinCancelReady) ||
                        (isConnected &&
                          !viewerAccessResolved &&
                          !effectiveIsMember)
                      }
                      onClick={handleMembershipClick}
                      onBlur={confirmingLeave ? clearConfirmLeave : undefined}
                    />
                  )}
                </div>
              </div>

              {config.topics.length > 0 ? (
                <div className="guild-hero-tags" aria-label="Guild topics">
                  {config.topics.map((tag) => (
                    <span key={tag}>{topicLabel(tag) ?? tag}</span>
                  ))}
                </div>
              ) : null}

              {config.description ? (
                <GuildDescriptionClamp text={config.description} />
              ) : null}

              {needsCollaborativeStorage ? (
                <p className="guild-storage-gate-copy">
                  {GUILD_COLLABORATIVE_JOIN_STORAGE_HINT}
                </p>
              ) : null}
            </section>

            {error ? <p className="guild-form-error">{error}</p> : null}

            <section className="guild-section guild-feed-section">
              {renderFeedFilters()}

              {feedPosts.length > 0 ? (
                <div
                  className={`home-feed-list${isFeedRefreshing ? ' is-refreshing' : ''}`}
                >
                  {feedBlocks.map(({ posts }, blockIndex) => (
                    <div key={postKey(posts[0]!)}>
                      <Divider
                        variant="item"
                        className={
                          blockIndex > 0
                            ? 'post-row-divider'
                            : 'post-row-divider post-row-divider--leading-hidden'
                        }
                      />
                      <FeedThreadBlock
                        block={posts}
                        groupId={groupId}
                        showChannel={selectedFeedFilterId === 'all'}
                        channelTitleById={channelTitleById}
                        postAuthorProfiles={postAuthorProfiles}
                        quotedPosts={quotedPosts}
                        engagement={engagement}
                        isReactionPending={isReactionPending}
                        isSavePending={isSavePending}
                        isSharePending={isSharePending}
                        onToggleReaction={toggleReaction}
                        onToggleSave={toggleSave}
                        onAmplifyConfirmed={confirmAmplify}
                        pollTallyFor={pollTallyFor}
                        isPollVotePending={isPollVotePending}
                        onPollVote={(post, optionIndex) => {
                          void castVote(post, optionIndex);
                        }}
                        onReply={replyHandler}
                        onExpandReply={openFullReply}
                        onQuote={quoteHandler}
                        onRepost={repostHandler}
                        onUndoRepost={undoRepostHandler}
                      />
                    </div>
                  ))}
                  {hasMorePosts || loadingMore ? (
                    <div className="home-feed-load-more">
                      {hasMorePosts ? (
                        <div
                          ref={loadMoreRef}
                          className="home-feed-sentinel"
                          aria-hidden
                        />
                      ) : null}
                      {loadingMore ? (
                        <PostRowSkeleton
                          rows={2}
                          showChannel={selectedFeedFilterId === 'all'}
                        />
                      ) : null}
                    </div>
                  ) : null}
                </div>
              ) : state.feedError ? (
                <div className="guild-state-card is-error">
                  <p>Guild posts could not load from the indexed feed.</p>
                  <small>{state.feedError}</small>
                  <button
                    className="guild-secondary-button"
                    type="button"
                    onClick={() => void refresh()}
                  >
                    Retry
                  </button>
                </div>
              ) : feedPending ? (
                <PostRowSkeleton
                  rows={3}
                  showChannel={selectedFeedFilterId === 'all'}
                />
              ) : (
                <div className="guild-state-card">
                  {selectedFeedSpace
                    ? canCompose
                      ? `No ${selectedFeedSpace.title.toLowerCase()} posts yet. Start this room from compose.`
                      : `No ${selectedFeedSpace.title.toLowerCase()} posts yet.`
                    : 'No guild posts yet. Members can start the feed from compose.'}
                </div>
              )}
            </section>
          </>
        ) : null}
      </div>
      {composer ? (
        <GuildComposerSheet
          open
          mode={composer.mode}
          target={composer.target}
          targetAuthorProfile={
            composer.target
              ? postAuthorProfiles[composer.target.accountId]
              : undefined
          }
          initialText={composer.initialText ?? ''}
          initialFiles={composer.initialFiles}
          onModeChange={
            composer.target
              ? (mode) =>
                  setComposer((current) =>
                    current ? { ...current, mode } : current
                  )
              : undefined
          }
          destination={
            composer.mode === 'post' && config && postableSpaces.length > 0
              ? {
                  kind: 'guild' as const,
                  name: config.name,
                  channels: postableSpaces.map((space) => ({
                    id: space.id,
                    title: space.title,
                  })),
                  selectedChannelId: composerSpace?.id ?? postableSpaces[0]!.id,
                  onChannelChange: setComposerSpaceId,
                }
              : undefined
          }
          pending={modalPending}
          error={modalError}
          onClose={(draft) => {
            if (modalPending) return;
            if (composer.mode === 'reply' && composer.target && draft) {
              writeWriteDockDraft(
                writeDockDraftKey('post', postKey(composer.target)),
                writeDockDraftFromComposer(draft)
              );
            }
            setComposer(null);
          }}
          onSubmit={(payload) => void submitFromModal(payload)}
        />
      ) : null}
      {accountId ? (
        <AppStorageSheet
          open={storageSheetOpen}
          accountId={accountId}
          refreshKey={storageRefreshKey}
          onClose={() => setStorageSheetOpen(false)}
          onStorageChanged={() =>
            setStorageRefreshKey((current) => current + 1)
          }
        />
      ) : null}
      {config && manageSheet === 'requests' ? (
        <GuildMemberRequestsSheet
          open
          groupId={groupId}
          accountId={accountId}
          isMember={viewer?.isMember ?? false}
          memberDriven={config.memberDriven}
          onClose={() => openManageSheet(null)}
          onResolved={() => void refresh()}
        />
      ) : null}
      {config && manageSheet === 'members' ? (
        <GuildMembersSheet
          open
          groupId={groupId}
          seedMembers={state.members}
          manageContext={{
            viewerAccountId: accountId,
            viewerIsOwner: viewer?.isOwner ?? false,
            viewerIsAdmin: viewer?.isAdmin ?? false,
            memberDriven: config.memberDriven,
          }}
          onClose={() => openManageSheet(null)}
          onMembersChanged={() => void refresh()}
          onAddStorage={(memberId) => {
            setGroupStorageRecipient(memberId);
            setGroupStorageSheetOpen(true);
          }}
        />
      ) : null}
      {config && manageSheet === 'proposals' ? (
        <GuildProposalsSheet
          open
          groupId={groupId}
          accountId={accountId}
          isMember={viewer?.isMember ?? false}
          memberDriven={config.memberDriven}
          onClose={() => openManageSheet(null)}
          onOpenRequests={
            viewer?.isMember ? () => openManageSheet('requests') : undefined
          }
          onResolved={() => void refresh()}
        />
      ) : null}
      {config && manageSheet === 'add-member' ? (
        <GuildAddMemberSheet
          open
          groupId={groupId}
          memberIds={state.members.map((member) => member.memberId)}
          onClose={() => openManageSheet(null)}
          onAdded={() => void refresh()}
        />
      ) : null}
      {config ? (
        <GuildFactsSheet
          open={factsSheetOpen}
          groupId={groupId}
          guildName={config.name}
          accessGated={config.accessGated}
          memberDriven={config.memberDriven}
          memberCount={memberCount}
          isMember={viewer?.isMember ?? false}
          isOwner={viewer?.isOwner ?? false}
          isAdmin={viewer?.isAdmin ?? false}
          canModerate={viewer?.canModerate ?? false}
          joinPending={joinPending}
          ownerId={config.ownerId}
          memberJoinedAt={viewerJoinedAt}
          createdAt={readGroupStatsCreatedAt(state.stats)}
          postCount={state.postCount}
          roomCount={feedSpaces.length}
          topics={config.topics}
          onClose={() => {
            setFactsSheetOpen(false);
            const next = factsNextRef.current;
            factsNextRef.current = null;
            if (next === 'members') openManageSheet('members');
          }}
          onOpenMembers={() => {
            factsNextRef.current = 'members';
          }}
        />
      ) : null}
      {canManageGuild ? (
        <GuildSettingsSheet
          open={settingsSheetOpen}
          guildName={config?.name}
          onClose={() => {
            setSettingsSheetOpen(false);
            const next = settingsNextRef.current;
            settingsNextRef.current = null;
            if (next === 'edit') setEditSheetOpen(true);
            if (next === 'rooms') setRoomsSheetOpen(true);
            if (next === 'storage') setGroupStorageSheetOpen(true);
          }}
          onEditGuild={() => {
            settingsNextRef.current = 'edit';
          }}
          onOpenRooms={() => {
            settingsNextRef.current = 'rooms';
          }}
          onOpenGroupStorage={() => {
            settingsNextRef.current = 'storage';
          }}
        />
      ) : null}
      {canManageGuild ? (
        <GuildGroupStorageSheet
          open={groupStorageSheetOpen}
          groupId={groupId}
          guildName={config?.name}
          initialRecipient={groupStorageRecipient}
          onClose={() => {
            setGroupStorageSheetOpen(false);
            setGroupStorageRecipient(null);
          }}
        />
      ) : null}
      {canManageGuild ? (
        <GuildEditSheet
          open={editSheetOpen}
          groupId={groupId}
          onClose={() => setEditSheetOpen(false)}
          onSaved={() => void refresh()}
        />
      ) : null}
      {canManageGuild ? (
        <GuildRoomsSheet
          open={roomsSheetOpen}
          groupId={groupId}
          onClose={() => setRoomsSheetOpen(false)}
          onSaved={() => void refresh()}
        />
      ) : null}
      {config && addSpaceOpen ? (
        <GuildAddSpaceSheet
          open
          groupId={groupId}
          memberDriven={config.memberDriven}
          structure={config.structure}
          onClose={() => setAddSpaceOpen(false)}
          onSaved={(space) => {
            void refresh();
            if (space?.postPolicy === 'allowlist') {
              setWritersTarget({
                spaceId: space.id,
                spaceTitle: space.title,
                canEdit: true,
              });
            }
          }}
        />
      ) : null}
      {config && writersTarget ? (
        <GuildSpaceWritersSheet
          open
          groupId={groupId}
          spaceId={writersTarget.spaceId}
          spaceTitle={writersTarget.spaceTitle}
          memberDriven={config.memberDriven}
          canEdit={writersTarget.canEdit}
          onClose={() => setWritersTarget(null)}
          onSaved={() => void refresh()}
        />
      ) : null}
    </OsAppScreen>
  );
}
