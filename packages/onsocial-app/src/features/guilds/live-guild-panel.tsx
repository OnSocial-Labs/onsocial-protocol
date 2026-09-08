'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { postContentPath, type PostRow } from '@onsocial/sdk';
import { Divider, OsIconAction, SettingsIcon } from '@onsocial/ui';
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
import {
  GuildFeedFilterList,
  GuildFeedFilterSkeleton,
} from '@/features/guilds/guild-feed-filter-list';
import { postMetaFromText } from '@/features/home/post-mentions';
import { placesMetaFromComposer } from '@/lib/post-place';
import {
  GuildComposerSheet,
  type GuildComposerMode,
  type GuildComposerSubmit,
} from '@/features/guilds/guild-composer-sheet';
import type { ComposerBeat } from '@/lib/composer-thread';
import {
  clearComposerThreadDraft,
  composerNewPostDraftKey,
  readComposerThreadDraft,
  writeComposerThreadDraft,
} from '@/lib/composer-thread-draft';
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
  guildMembershipStatusHint,
} from '@/features/guilds/guild-config';
import {
  GuildPageHero,
  GuildPageHeroSkeleton,
  guildPageHeroLook,
} from '@/features/guilds/guild-page-hero';
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
import {
  collectRelayTxHashes,
  guildPath,
  guildSheetPath,
  manageSheetFromShare,
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
} from '@/lib/post-media';
import { normalizeComposerContentLabels } from '@/lib/post-content-labels';
import { createReadOnlyOnSocialClient } from '@/lib/create-readonly-onsocial-client';
import type { GuildPageData } from '@/lib/load-guild-page';
import {
  readGroupStatsCreatedAt,
  resolveGuildMemberCount,
} from '@/features/guilds/guild-facts';
import { readGuildMembershipCache } from '@/lib/guild-membership-cache';
import { useGuildMembershipAction } from '@/features/guilds/use-guild-membership-action';
import type { GuildMembershipOutcome } from '@/features/guilds/guild-membership-action';
import {
  GUILD_FEED_LOAD_MORE_ERROR,
  pendingJoinRequest,
  type GuildFeedFilterId,
} from '@/features/guilds/guild-page-data';
import { useGuildPageData } from '@/features/guilds/use-guild-page-data';
import { seedScarceEmbedsFromSsr } from '@/features/scarces/scarce-embed-ledger';
import { isDropComposeDraftReady } from '@/features/scarces/drop-compose-draft';
import {
  submitGuildRootPost,
  subscribeGuildPostConfirmed,
} from '@/features/scarces/submit-guild-drop-post';
import { hydrateScarceEmbedsForPosts } from '@/lib/feed-paint-hydrate';
import {
  txToastConfirming,
  txToastError,
  txToastSuccess,
} from '@/lib/transaction-toast-copy';
import { isWalletUserCancellation } from '@/lib/wallet-errors';

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
  const [composerSpaceId, setComposerSpaceId] = useState('general');
  const [feedFilter, setFeedFilter] = useState<{
    groupId: string;
    id: GuildFeedFilterId;
  }>({ groupId, id: 'all' });
  const selectedFeedFilterId =
    feedFilter.groupId === groupId ? feedFilter.id : 'all';
  const setSelectedFeedFilterId = useCallback(
    (id: GuildFeedFilterId) => {
      setFeedFilter({ groupId, id });
    },
    [groupId]
  );
  const {
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
    loadMoreError,
    isFeedRefreshing,
    localPosts,
    setLocalPosts,
    viewerAccess,
    selectedFeedSpace,
    optimisticJoinPending,
    setOptimisticJoinPending,
    refresh,
    loadMoreFeed,
    scheduleReconcile,
  } = useGuildPageData({
    groupId,
    initial,
    accountId,
    walletLoading,
    selectedFeedFilterId,
  });
  const newPostDraftKey = composerNewPostDraftKey(groupId);
  const [composer, setComposer] = useState<{
    mode: GuildComposerMode;
    target: PostRow | null;
    initialText?: string;
    initialFiles?: File[];
    initialBeats?: ComposerBeat[];
  } | null>(null);
  const [modalPending, setModalPending] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);
  const [headerElevated, setHeaderElevated] = useState(false);
  const [manageSheet, setManageSheet] = useState<GuildManageSheetId | null>(
    () => manageSheetFromShare(initialSheet)
  );
  const [settingsSheetOpen, setSettingsSheetOpen] = useState(
    initialSheet === 'settings'
  );
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
  const scrollRootRef = useRef<HTMLElement | null>(null);
  const heroTitleRef = useRef<HTMLHeadingElement | null>(null);
  const loadMoreRef = useRef<HTMLDivElement | null>(null);
  const lastHydratedFeedKeysRef = useRef('');

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
    setManageSheet(manageSheetFromShare(initialSheet));
    setSettingsSheetOpen(initialSheet === 'settings');
  }, [initialSheet]);

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
  // Repost rows render (and act on) the original post — engagement and poll
  // tallies both key on the original, so both hooks need the expanded list.
  const engagementPosts = useMemo(
    () => withRepostOriginals(feedPosts, quotedPosts),
    [feedPosts, quotedPosts]
  );
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
  } = usePostEngagement(engagementPosts, {
    initial: initial?.engagement ?? null,
    onError: (message) => setTxResult({ type: 'error', msg: message }),
  });
  const { pollTallyFor, castVote, isPollVotePending } = usePollVotes(
    engagementPosts,
    {
      onError: (message) => setTxResult({ type: 'error', msg: message }),
    }
  );

  // Soft-fill scarce CTAs when the feed changes (space filter / refresh).
  useEffect(() => {
    if (feedPosts.length === 0) return;
    const keys = feedPosts.map(postKey).join('|');
    if (keys === lastHydratedFeedKeysRef.current) return;
    const client = createReadOnlyOnSocialClient();
    let cancelled = false;
    void hydrateScarceEmbedsForPosts(client, feedPosts).then((map) => {
      if (cancelled) return;
      lastHydratedFeedKeysRef.current = keys;
      seedScarceEmbedsFromSsr(map);
    });
    return () => {
      cancelled = true;
    };
  }, [feedPosts]);

  useEffect(() => {
    lastHydratedFeedKeysRef.current = '';
    setHeaderElevated(false);
  }, [groupId]);

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

  useInfiniteScrollSentinel({
    scrollRootRef,
    sentinelRef: loadMoreRef,
    enabled: hasMorePosts && state.posts.length > 0 && !loadMoreError,
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

  const membershipSnapshot = useMemo(
    () => ({
      isMember: effectiveIsMember,
      joinPending: effectiveJoinPending,
      isOwner: effectiveIsOwner,
      isBlacklisted: effectiveIsBlacklisted,
      accessGated: Boolean(config?.accessGated),
      memberDriven: Boolean(config?.memberDriven),
      pendingJoinProposalId: viewer?.pendingJoinProposalId ?? null,
      joinCancelReady,
    }),
    [
      config?.accessGated,
      config?.memberDriven,
      effectiveIsBlacklisted,
      effectiveIsMember,
      effectiveIsOwner,
      effectiveJoinPending,
      joinCancelReady,
      viewer?.pendingJoinProposalId,
    ]
  );

  const handleMembershipConfirmed = useCallback(
    async (outcome: GuildMembershipOutcome) => {
      if (
        outcome === 'requested' ||
        (outcome === 'joined' && config?.memberDriven)
      ) {
        setOptimisticJoinPending(true);
      } else if (outcome === 'canceled') {
        setOptimisticJoinPending(false);
      }
      await refresh();
    },
    [config?.memberDriven, refresh]
  );

  const handleOwnerManage = useCallback(() => {
    openManageSheet('members');
  }, [openManageSheet]);

  const {
    confirmingLeave,
    actionPending,
    clearConfirmLeave,
    handleMembershipClick: runMembershipClick,
  } = useGuildMembershipAction({
    groupId,
    snapshot: membershipSnapshot,
    canMutate: Boolean(config) && viewerAccessResolved,
    onOwnerManage: handleOwnerManage,
    onConfirmed: handleMembershipConfirmed,
  });

  const handleMembershipClick = () =>
    runMembershipClick({
      needsStorage: needsCollaborativeStorage,
      onNeedsStorage: () => setStorageSheetOpen(true),
      requireResolvedAccess: true,
      viewerAccessResolved,
    });

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

  const openComposerModal = (mode: GuildComposerMode) => (target: PostRow) => {
    setModalError(null);
    setComposer({ mode, target });
  };

  const openPostComposer = useCallback(() => {
    setModalError(null);
    const draft = readComposerThreadDraft(newPostDraftKey);
    setComposer({
      mode: 'post',
      target: null,
      ...(draft.length > 0 ? { initialBeats: draft } : {}),
    });
  }, [newPostDraftKey]);

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
    if (!text && !files.length && !drop && !payload.thread?.length) return;
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

    setModalError(null);
    setModalPending(true);
    try {
      const { client } = await getClient();
      if (mode === 'post') {
        if (!composerSpace) {
          throw new Error('Choose a room before posting.');
        }
        const result = await submitGuildRootPost({
          client,
          accountId,
          groupId,
          space: composerSpace,
          payload,
          trackTransaction,
        });
        const landed = result.optimisticPosts?.length
          ? result.optimisticPosts
          : result.optimisticPost
            ? [result.optimisticPost]
            : [];
        if (landed.length > 0) {
          setLocalPosts((current) => {
            const next = [...current];
            for (const post of landed) {
              if (next.some((row) => postKey(row) === postKey(post))) continue;
              next.unshift(post);
            }
            return next;
          });
          scheduleReconcile();
        }
        if (result.confirmed) {
          clearComposerThreadDraft(newPostDraftKey);
          setComposer(null);
        }
        return result;
      }

      const contentLabels = normalizeComposerContentLabels(payload);
      const newPostId = Date.now().toString();
      const filePayload = files.length ? { files } : {};
      const media = files.length
        ? buildOptimisticMediaEntries(files)
        : undefined;
      const tagPayload = {
        ...postMetaFromText(text),
        ...placesMetaFromComposer(payload.places),
      };
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
      const response =
        mode === 'quote'
          ? await client.groups.quotePost(groupId, ref, postData, newPostId)
          : await client.groups.replyToPost(
              groupId,
              ref,
              postData,
              newPostId
            );

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
        setLocalPosts((current) => [
          {
            accountId,
            postId: newPostId,
            value: JSON.stringify({
              v: 1,
              text,
              ...tagPayload,
              ...(media ? { media } : {}),
              ...contentLabels,
            }),
            blockHeight: 0,
            blockTimestamp: Date.now(),
            groupId,
            isGroupContent: true,
            ...(mode === 'quote'
              ? {
                  refAuthor: target!.accountId,
                  refPath: postContentPath(target!),
                  refType: 'post',
                  ...feedMeta,
                }
              : {
                  parentAuthor: target!.accountId,
                  parentPath: postContentPath(target!),
                  parentType: 'post',
                  ...feedMeta,
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
    authorNameFor: (accountId) => postAuthorProfiles[accountId]?.displayName,
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
                onClick={() => {
                  setSettingsSheetOpen(true);
                  router.replace(guildSheetPath(groupId, 'settings'), {
                    scroll: false,
                  });
                }}
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
            data-guild-page-skeleton
            aria-busy="true"
            aria-label="Loading guild"
          >
            {shellPreview ? (
              <GuildPageHero
                groupId={groupId}
                look={guildPageHeroLook(shellPreview)}
                titleRef={heroTitleRef}
              />
            ) : (
              <GuildPageHeroSkeleton />
            )}
            {feedSpaces.length > 0 ? (
              renderFeedFilters()
            ) : (
              <GuildFeedFilterSkeleton />
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
            <GuildPageHero
              groupId={groupId}
              look={guildPageHeroLook(config)}
              titleRef={heroTitleRef}
              showFacts
              onOpenFacts={() => setFactsSheetOpen(true)}
              statusHint={guildMembershipStatusHint({
                isBlacklisted: effectiveIsBlacklisted,
                needsStorage: needsCollaborativeStorage,
              })}
              leading={
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
              }
              membership={
                membershipChromePending ? (
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
                )
              }
            />

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
                  {loadMoreError ? (
                    <div className="guild-state-card is-error">
                      <p>{GUILD_FEED_LOAD_MORE_ERROR}</p>
                      {loadMoreError !== GUILD_FEED_LOAD_MORE_ERROR ? (
                        <small>{loadMoreError}</small>
                      ) : null}
                      <button
                        className="guild-secondary-button"
                        type="button"
                        onClick={() => loadMoreFeed()}
                      >
                        Retry
                      </button>
                    </div>
                  ) : hasMorePosts || loadingMore ? (
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
                    ? `No ${selectedFeedSpace.title.toLowerCase()} posts yet.`
                    : 'No guild posts yet.'}
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
          initialBeats={composer.initialBeats}
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
                  name: guildDisplayName(config.name, groupId),
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
            if (composer.mode === 'post' && draft?.beats) {
              writeComposerThreadDraft(newPostDraftKey, draft.beats);
            } else if (composer.mode === 'reply' && composer.target && draft) {
              writeWriteDockDraft(
                writeDockDraftKey('post', postKey(composer.target)),
                writeDockDraftFromComposer(draft)
              );
            }
            setComposer(null);
          }}
          onSubmit={submitFromModal}
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
          guildName={guildDisplayName(config.name, groupId)}
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
          guildName={
            config ? guildDisplayName(config.name, groupId) : undefined
          }
          onClose={() => {
            setSettingsSheetOpen(false);
            const next = settingsNextRef.current;
            settingsNextRef.current = null;
            if (next === 'edit') setEditSheetOpen(true);
            if (next === 'rooms') setRoomsSheetOpen(true);
            if (next === 'storage') setGroupStorageSheetOpen(true);
            router.replace(guildPath(groupId), { scroll: false });
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
          guildName={
            config ? guildDisplayName(config.name, groupId) : undefined
          }
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
