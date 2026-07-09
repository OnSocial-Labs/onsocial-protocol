'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  postContentPath,
  type GroupMemberRow,
  type GroupStats,
  type JoinRequest,
  type PostRow,
} from '@onsocial/sdk';
import {
  Divider,
  ProfileAvatar,
  PulsingDots,
  SlidersHorizontalIcon,
  osIconActionClassName,
} from '@onsocial/ui';
import { OsAppScreen } from '@/components/app/os-app-screen';
import { AppStorageSheet } from '@/components/wallet/app-storage-sheet';
import { useAppWallet } from '@/contexts/app-wallet-context';
import { useAppTransactionFeedback } from '@/contexts/app-transaction-feedback-context';
import { useRegisterComposeAction } from '@/contexts/compose-launcher-context';
import { PostRowSkeleton, postKey } from '@/features/home/post-card';
import {
  GuildComposerModal,
  type GuildComposerMode,
} from '@/features/guilds/guild-composer-modal';
import {
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
import { GuildAddMemberSheet } from '@/features/guilds/guild-add-member-sheet';
import { GuildAddSpaceSheet } from '@/features/guilds/guild-add-space-sheet';
import {
  GuildManageMenu,
  type GuildManageSheetId,
} from '@/features/guilds/guild-manage-menu';
import { GuildMemberRequestsSheet } from '@/features/guilds/guild-member-requests-sheet';
import { GuildMembersSheet } from '@/features/guilds/guild-members-sheet';
import { GuildProposalsSheet } from '@/features/guilds/guild-proposals-sheet';
import {
  collectRelayTxHashes,
  guildSectionPath,
} from '@/features/guilds/guilds-data';
import { useAppOnSocialClient } from '@/hooks/use-app-onsocial-client';
import { useUserStorageBalance } from '@/hooks/use-user-storage-balance';
import { coalesceFeedThreads } from '@/lib/feed-threads';
import { usePostAuthorProfiles } from '@/hooks/use-post-author-profiles';
import { usePostEngagement } from '@/hooks/use-post-engagement';
import { useQuotedPosts } from '@/hooks/use-quoted-posts';
import { resolveGuildViewerAccess } from '@/features/guilds/guild-viewer-access';
import {
  readGuildOwnerId,
  reconcileGuildMemberRoster,
} from '@/features/guilds/guild-member-roster';
import { createReadOnlyOnSocialClient } from '@/lib/create-readonly-onsocial-client';
import { guildHeroCoverClassName } from '@/features/guilds/guild-visual';
import {
  guildAccessLabel,
  resolveGuildMemberCount,
} from '@/features/guilds/guild-facts';
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

export function LiveGuildPanel({ groupId }: { groupId: string }) {
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
  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [state, setState] = useState<LiveGuildState>({
    config: null,
    stats: null,
    members: [],
    posts: [],
    feedError: null,
    viewer: null,
    moderation: null,
  });
  const [localPosts, setLocalPosts] = useState<PostRow[]>([]);
  const [hasMorePosts, setHasMorePosts] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [isFeedRefreshing, setIsFeedRefreshing] = useState(false);
  const [actionPending, setActionPending] = useState(false);
  const [composerSpaceId, setComposerSpaceId] = useState('general');
  const [selectedFeedFilterId, setSelectedFeedFilterId] =
    useState<GuildFeedFilterId>('all');
  const [composer, setComposer] = useState<{
    mode: GuildComposerMode;
    target: PostRow | null;
  } | null>(null);
  const [modalPending, setModalPending] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [optimisticJoinPending, setOptimisticJoinPending] = useState(false);
  const [headerElevated, setHeaderElevated] = useState(false);
  const [confirmingLeave, setConfirmingLeave] = useState(false);
  const [manageSheet, setManageSheet] = useState<GuildManageSheetId | null>(
    null
  );
  const [addSpaceOpen, setAddSpaceOpen] = useState(false);
  const hasLoadedRef = useRef(false);
  const reconcileTimersRef = useRef<number[]>([]);
  const confirmLeaveTimerRef = useRef<number | null>(null);
  const scrollRootRef = useRef<HTMLElement | null>(null);
  const heroTitleRef = useRef<HTMLHeadingElement | null>(null);

  const config = state.config;
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
  const title = config?.name ?? groupId;
  const viewerAccess = useMemo(
    () => ({
      isMember: viewer?.isMember ?? false,
      canModerate: viewer?.canModerate ?? false,
      isAdmin: viewer?.isAdmin ?? false,
      isOwner: viewer?.isOwner ?? false,
    }),
    [viewer]
  );
  const feedSpaces = useMemo(
    () => (config ? enabledGuildSpaces(config.structure) : []),
    [config]
  );
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
    return (
      guildSpaceById(config.structure, composerSpaceId) ??
      defaultComposerSpace(config.structure, viewerAccess)
    );
  }, [composerSpaceId, config, viewerAccess]);
  const canPostInChannel = useCallback(
    (channel: string | null | undefined) =>
      config
        ? canViewerPostInChannel(config.structure, channel, viewerAccess)
        : false,
    [config, viewerAccess]
  );
  const canCompose = Boolean(composerSpace);
  /** Overview aggregates every room — name the post destination explicitly. */
  const composePromptLabel = useMemo(() => {
    if (!composerSpace) return '';
    if (selectedFeedFilterId === 'all') {
      return null;
    }
    return 'Share something here…';
  }, [composerSpace, selectedFeedFilterId]);
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
  const facepileIds = useMemo(() => {
    const ids = state.members.map((member) => member.memberId);
    if (viewer?.isMember && accountId && !ids.includes(accountId)) {
      ids.unshift(accountId);
    }
    return ids;
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
  const { engagement, toggleReaction, isReactionPending } = usePostEngagement(
    feedPosts,
    {
      onError: (message) => setTxResult({ type: 'error', msg: message }),
    }
  );

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
      setLocalPosts((current) =>
        current.filter((post) => !indexedKeys.has(postKey(post)))
      );
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

  const refreshShell = useCallback(async () => {
    setError(null);

    const client = createReadOnlyOnSocialClient();
    const rawConfig = await client.groups.getConfig(groupId);

    if (!rawConfig) {
      setState({
        config: null,
        stats: null,
        members: [],
        posts: [],
        feedError: null,
        viewer: null,
        moderation: null,
      });
      setLoadState('missing');
      return false;
    }

    const normalizedConfig = normalizeGuildConfig(groupId, rawConfig);

    const [statsResult, membersResult, viewerResult] = await Promise.allSettled([
      client.groups.getStats(groupId),
      client.query.groups.membersOf(groupId, { limit: 8 }),
      accountId
        ? resolveGuildViewerAccess(client, groupId, accountId, {
            memberDriven: normalizedConfig.memberDriven,
            accessGated: normalizedConfig.accessGated,
          })
        : Promise.resolve(null),
    ]);

    const viewerState =
      viewerResult.status === 'fulfilled' && viewerResult.value
        ? viewerResult.value.viewer
        : null;
    const moderationState =
      viewerResult.status === 'fulfilled'
        ? (viewerResult.value?.moderation ?? null)
        : null;

    setState((current) => ({
      ...current,
      config: normalizedConfig,
      stats: statsResult.status === 'fulfilled' ? statsResult.value : null,
      members: reconcileGuildMemberRoster(
        membersResult.status === 'fulfilled'
          ? (membersResult.value.items ?? [])
          : [],
        readGuildOwnerId(rawConfig)
      ),
      viewer: viewerState,
      moderation: moderationState,
    }));
    setLoadState('ready');
    return true;
  }, [accountId, groupId]);

  const refresh = useCallback(async () => {
    if (hasLoadedRef.current) {
      setIsFeedRefreshing(true);
    } else {
      setLoadState('loading');
    }
    setError(null);

    try {
      const shellReady = await refreshShell();
      if (!shellReady) {
        hasLoadedRef.current = true;
        return;
      }
      await refreshFeed();
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
    if (walletLoading) return;
    hasLoadedRef.current = false;
    void refresh();
    // Shell + feed load is scoped to guild/account changes; tab switches use refreshFeed.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- refreshFeed intentionally excluded
  }, [accountId, groupId, walletLoading]);

  useEffect(() => {
    if (walletLoading || !hasLoadedRef.current) return;
    void refreshFeed();
  }, [refreshFeed, selectedFeedFilterId, walletLoading]);

  useEffect(() => {
    if (viewer?.pendingJoinProposalId || viewer?.isMember) {
      setOptimisticJoinPending(false);
    }
  }, [viewer?.isMember, viewer?.pendingJoinProposalId]);

  useEffect(() => {
    const scrollRoot = scrollRootRef.current;
    if (!scrollRoot) return;

    // Title handoff: elevate the bar (and fade its title in) only once the
    // hero name has scrolled under it, so the name never doubles on screen.
    const heroTitle = heroTitleRef.current;
    if (heroTitle) {
      const observer = new IntersectionObserver(
        ([entry]) => setHeaderElevated(!entry.isIntersecting),
        // Top margin ≈ bar height; hero title counts as gone once beneath it.
        { root: scrollRoot, rootMargin: '-72px 0px 0px 0px', threshold: 0 }
      );
      observer.observe(heroTitle);
      return () => observer.disconnect();
    }

    const updateHeader = () => setHeaderElevated(scrollRoot.scrollTop > 18);
    updateHeader();
    scrollRoot.addEventListener('scroll', updateHeader, { passive: true });
    return () => scrollRoot.removeEventListener('scroll', updateHeader);
  }, [loadState]);

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

  const loadMoreFeed = useCallback(async () => {
    if (loadingMore) return;
    setLoadingMore(true);
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
      // Keep the current list; the button stays available to retry.
    } finally {
      setLoadingMore(false);
    }
  }, [groupId, loadingMore, selectedFeedSpace, state.posts.length]);

  // Never show a count the viewer knows is stale (e.g. "0 members" while the
  // member-only Leave action is visible) — trust the confirmed facepile.
  const memberCount =
    resolveGuildMemberCount({
      chainStats: state.stats,
      rosterFloor: facepileIds.length,
    }) ?? 0;
  const proposalCount = state.stats?.proposal_count ?? 0;
  const actionLabel = useMemo(() => {
    if (!isConnected) return 'Connect wallet';
    if (!config) return 'Load guild';
    if (viewer?.isMember) return confirmingLeave ? 'Leave guild?' : 'Joined';
    if (joinPending) return joinCancelReady ? 'Cancel request' : 'Request pending';
    if (needsCollaborativeStorage) return 'Add storage';
    return config.accessGated ? 'Request access' : 'Join guild';
  }, [
    config,
    confirmingLeave,
    isConnected,
    joinPending,
    joinCancelReady,
    needsCollaborativeStorage,
    viewer?.isMember,
  ]);

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

    setActionPending(true);
    try {
      const { client } = await getClient();
      const response = viewer?.isMember
        ? await client.groups.leave(groupId)
        : joinPending
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
        submittedMessage: viewer?.isMember
          ? txToastConfirming.leavingGuild
          : joinPending
            ? txToastConfirming.cancelingGuildRequest
            : config.accessGated
              ? txToastConfirming.requestingGuildAccess
              : txToastConfirming.joiningGuild,
        successMessage: viewer?.isMember
          ? txToastSuccess.guildLeft
          : joinPending
            ? txToastSuccess.guildRequestCanceled
            : config.accessGated
              ? txToastSuccess.guildAccessRequested
              : txToastSuccess.guildJoined,
        failureMessage: txToastError.guildMembershipFailed,
      });

      if (confirmed) {
        if (
          config.memberDriven &&
          !viewer?.isMember &&
          !joinPending
        ) {
          setOptimisticJoinPending(true);
        } else if (joinPending) {
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
      setActionPending(false);
    }
  };

  /** Leaving is on-chain and destructive — require a second tap to confirm. */
  const handleMembershipClick = () => {
    if (needsCollaborativeStorage) {
      setStorageSheetOpen(true);
      return;
    }
    if (joinPending && !joinCancelReady) {
      return;
    }
    if (viewer?.isMember && !confirmingLeave) {
      setConfirmingLeave(true);
      confirmLeaveTimerRef.current = window.setTimeout(() => {
        confirmLeaveTimerRef.current = null;
        setConfirmingLeave(false);
      }, 4_000);
      return;
    }
    clearConfirmLeave();
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

  useRegisterComposeAction(canCompose ? openPostComposer : null);

  const submitFromModal = async (text: string) => {
    if (!composer || modalPending) return;
    const { mode, target } = composer;
    if (mode !== 'post' && !target) return;

    if (mode !== 'post' && target) {
      const threadChannel = target.channel ?? composerSpace?.id ?? null;
      if (!canPostInChannel(threadChannel)) {
        setModalError('You cannot reply in this space.');
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
      const newPostId = Date.now().toString();
      const { client } = await getClient();

      let response: unknown;
      if (mode === 'post') {
        if (!composerSpace) {
          throw new Error('Choose a space before posting.');
        }
        response = await client.groups.post(
          groupId,
          {
            text,
            access: 'group',
            groupId,
            channel: guildSpaceFeedChannel(composerSpace),
            kind: composerSpace.kind,
            audiences: [composerSpace.audience],
            timestamp: Date.now(),
          },
          newPostId
        );
      } else {
        const ref = {
          author: target!.accountId,
          groupId,
          postId: target!.postId,
        };
        const feedMeta = inheritedGuildReplyFeedMeta(target!, {
          fallbackChannel: composerSpace
            ? guildSpaceFeedChannel(composerSpace)
            : null,
          fallbackKind: composerSpace?.kind ?? null,
          fallbackAudiences: composerSpace ? [composerSpace.audience] : undefined,
        });
        const postData = {
          text,
          access: 'group' as const,
          groupId,
          timestamp: Date.now(),
          ...feedMeta,
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
            : inheritedGuildReplyFeedMeta(target, {
                fallbackChannel: composerSpace
                  ? guildSpaceFeedChannel(composerSpace)
                  : null,
                fallbackKind: composerSpace?.kind ?? null,
                fallbackAudiences: composerSpace
                  ? [composerSpace.audience]
                  : undefined,
              });
        // Chain-confirmed; show at the top while the indexer catches up.
        setLocalPosts((current) => [
          {
            accountId,
            postId: newPostId,
            value: JSON.stringify({ v: 1, text }),
            blockHeight: 0,
            blockTimestamp: Date.now(),
            groupId,
            isGroupContent: true,
            ...(mode === 'post' && composerSpace
              ? {
                  channel: guildSpaceFeedChannel(composerSpace),
                  kind: composerSpace.kind,
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

  const replyHandler =
    viewer?.isMember && config
      ? (post: PostRow) => {
          const channel =
            post.channel ??
            (composerSpace ? guildSpaceFeedChannel(composerSpace) : null);
          if (!canPostInChannel(channel)) return;
          openComposerModal('reply')(post);
        }
      : undefined;
  const quoteHandler =
    viewer?.isMember && config
      ? (post: PostRow) => {
          const channel =
            post.channel ??
            (composerSpace ? guildSpaceFeedChannel(composerSpace) : null);
          if (!canPostInChannel(channel)) return;
          openComposerModal('quote')(post);
        }
      : undefined;

  return (
    <OsAppScreen
      title={title}
      subtitle={
        config
          ? guildAccessLabel(config.accessGated)
          : 'Guilds are public on-chain spaces with access-gated participation.'
      }
      backFallbackHref="/groups"
      actions={
        loadState === 'ready' && config && canManageGuild ? (
          <>
            <GuildManageMenu
              pendingRequestCount={
                state.moderation?.pendingMemberRequestCount ?? 0
              }
              memberCount={memberCount}
              activeProposalCount={state.moderation?.activeProposalCount ?? 0}
              accessGated={config.accessGated}
              memberDriven={config.memberDriven}
              canAddMember={canAddMember}
              onOpenSheet={setManageSheet}
            />
            <Link
              className={osIconActionClassName}
              href={guildSectionPath(groupId, 'settings')}
              aria-label="Guild settings"
            >
              <SlidersHorizontalIcon
                className="glass-sheet-close-icon"
                aria-hidden
              />
            </Link>
          </>
        ) : undefined
      }
      immersiveHeader={loadState === 'ready'}
      headerElevated={headerElevated}
      scrollRootRef={scrollRootRef}
    >
      <div className="guilds-page">
        {loadState === 'loading' ? <PostRowSkeleton rows={4} /> : null}

        {loadState === 'missing' ? (
          <section className="guild-hero-card">
            <p className="guild-eyebrow">Not found</p>
            <h2>We could not find this guild yet.</h2>
            <p>
              If it was just created, wait for the transaction to settle and try
              again. Anyone can open this page directly once the group exists on
              the core contract.
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
                aria-hidden
              >
                {config.bannerUrl ? (
                  <img
                    src={config.bannerUrl}
                    alt=""
                  />
                ) : null}
              </div>
              <h2 ref={heroTitleRef}>{config.name}</h2>
              {config.description ? (
                <p className="guild-hero-description">{config.description}</p>
              ) : null}
              <div className="guild-hero-meta">
                <button
                  type="button"
                  className="guild-facepile"
                  aria-label={`${memberCount} ${memberCount === 1 ? 'member' : 'members'}. View roster.`}
                  onClick={() => setManageSheet('members')}
                >
                  {facepileIds.length > 0 ? (
                    <span className="guild-facepile-avatars" aria-hidden>
                      {facepileIds.slice(0, 5).map((memberId) => (
                        <ProfileAvatar
                          key={memberId}
                          src={postAuthorProfiles[memberId]?.avatarUrl ?? null}
                          fallbackInitial={
                            postAuthorProfiles[memberId]?.displayName ??
                            memberId
                          }
                          size="sm"
                          className="guild-facepile-avatar"
                        />
                      ))}
                    </span>
                  ) : null}
                  <span className="guild-facepile-count">
                    {memberCount} {memberCount === 1 ? 'member' : 'members'}
                  </span>
                </button>
                {config.memberDriven ? (
                  <button
                    type="button"
                    className="guild-hero-meta-link"
                    onClick={() => setManageSheet('proposals')}
                  >
                    {proposalCount > 0
                      ? `${proposalCount} ${proposalCount === 1 ? 'proposal' : 'proposals'}`
                      : 'Proposals'}
                  </button>
                ) : (
                  <Link
                    className="guild-hero-meta-link"
                    href={guildSectionPath(groupId, 'proposals')}
                  >
                    {proposalCount > 0
                      ? `${proposalCount} ${proposalCount === 1 ? 'proposal' : 'proposals'}`
                      : 'Proposals'}
                  </Link>
                )}
                {config.tags.length > 0 ? (
                  <span className="guild-hero-tags">
                    {config.tags.slice(0, 2).map((tag) => (
                      <span key={tag}>#{tag}</span>
                    ))}
                    {config.tags.length > 2 ? (
                      <span>+{config.tags.length - 2}</span>
                    ) : null}
                  </span>
                ) : null}
                <button
                  className={
                    viewer?.isMember
                      ? `guild-secondary-button guild-hero-action${confirmingLeave ? ' is-confirm-leave' : ''}`
                      : joinPending
                        ? 'guild-secondary-button guild-hero-action'
                        : 'guild-primary-button guild-hero-action'
                  }
                  type="button"
                  disabled={actionPending || (joinPending && !joinCancelReady)}
                  onClick={handleMembershipClick}
                  onBlur={confirmingLeave ? clearConfirmLeave : undefined}
                >
                  {actionPending ? (
                    <PulsingDots size="sm" className="guild-hero-action-dots" />
                  ) : (
                    actionLabel
                  )}
                </button>
              </div>
              {needsCollaborativeStorage ? (
                <p className="guild-storage-gate-copy">
                  {GUILD_COLLABORATIVE_JOIN_STORAGE_HINT}
                </p>
              ) : null}
            </section>

            {error ? <p className="guild-form-error">{error}</p> : null}

            <section className="guild-section guild-feed-section">
              <div
                className="guild-feed-filter-list"
                aria-label="Guild feed filters"
              >
                <button
                  className={`guild-feed-filter-button${selectedFeedFilterId === 'all' ? ' is-active' : ''}`}
                  type="button"
                  onClick={() => setSelectedFeedFilterId('all')}
                >
                  Overview
                </button>
                {feedSpaces.map((space) => (
                  <button
                    key={space.id}
                    className={`guild-feed-filter-button${selectedFeedFilterId === space.id ? ' is-active' : ''}`}
                    type="button"
                    onClick={() => setSelectedFeedFilterId(space.id)}
                  >
                    {space.title}
                  </button>
                ))}
                {canAddMember ? (
                  <button
                    className="guild-feed-filter-button guild-feed-filter-button--add"
                    type="button"
                    onClick={() => setAddSpaceOpen(true)}
                  >
                    + Add space
                  </button>
                ) : null}
              </div>
              {canCompose ? (
                <button
                  type="button"
                  className="guild-reply-prompt"
                  onClick={openPostComposer}
                  aria-label={
                    selectedFeedFilterId === 'all'
                      ? `Share in ${composerSpace!.title}. Opens composer to choose room.`
                      : `Share something in ${composerSpace!.title}`
                  }
                >
                  {composePromptLabel ?? (
                    <>
                      Share in{' '}
                      <span className="guild-reply-prompt-destination">
                        {composerSpace!.title}
                      </span>
                      …
                    </>
                  )}
                </button>
              ) : viewer?.isMember ? (
                <div className="guild-state-card">
                  No spaces are available for you to post in yet.
                </div>
              ) : (
                <div className="guild-state-card">
                  Join this guild before posting. Public chain data stays
                  visible, but posting is member-gated.
                </div>
              )}

              {feedPosts.length > 0 ? (
                <div
                  className={`home-feed-list${isFeedRefreshing ? ' is-refreshing' : ''}`}
                >
                  {feedBlocks.map((block, blockIndex) => (
                    <div key={postKey(block[0])}>
                      {blockIndex > 0 ? (
                        <Divider variant="item" className="post-row-divider" />
                      ) : null}
                      <FeedThreadBlock
                        block={block}
                        groupId={groupId}
                        showChannel={selectedFeedFilterId === 'all'}
                        postAuthorProfiles={postAuthorProfiles}
                        quotedPosts={quotedPosts}
                        engagement={engagement}
                        isReactionPending={isReactionPending}
                        onToggleReaction={toggleReaction}
                        onReply={replyHandler}
                        onQuote={quoteHandler}
                      />
                    </div>
                  ))}
                  {hasMorePosts ? (
                    <button
                      type="button"
                      className="guild-load-more"
                      disabled={loadingMore}
                      onClick={() => void loadMoreFeed()}
                    >
                      {loadingMore ? 'Loading…' : 'Show more posts'}
                    </button>
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
              ) : (
                <div className="guild-state-card">
                  {selectedFeedSpace
                    ? `No ${selectedFeedSpace.title.toLowerCase()} posts yet. Members can start this space from the composer.`
                    : 'No guild posts yet. Members can start the feed from this page.'}
                </div>
              )}
            </section>
          </>
        ) : null}
      </div>
      {composer ? (
        <GuildComposerModal
          mode={composer.mode}
          target={composer.target}
          targetAuthorProfile={
            composer.target
              ? postAuthorProfiles[composer.target.accountId]
              : undefined
          }
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
          onClose={() => {
            if (!modalPending) setComposer(null);
          }}
          onSubmit={(text) => void submitFromModal(text)}
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
          onClose={() => setManageSheet(null)}
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
          onClose={() => setManageSheet(null)}
          onMembersChanged={() => void refresh()}
        />
      ) : null}
      {config && manageSheet === 'proposals' ? (
        <GuildProposalsSheet
          open
          groupId={groupId}
          accountId={accountId}
          isMember={viewer?.isMember ?? false}
          memberDriven={config.memberDriven}
          onClose={() => setManageSheet(null)}
          onOpenRequests={
            viewer?.isMember
              ? () => setManageSheet('requests')
              : undefined
          }
          onResolved={() => void refresh()}
        />
      ) : null}
      {config && manageSheet === 'add-member' ? (
        <GuildAddMemberSheet
          open
          groupId={groupId}
          onClose={() => setManageSheet(null)}
          onAdded={() => void refresh()}
        />
      ) : null}
      {config && addSpaceOpen ? (
        <GuildAddSpaceSheet
          open
          groupId={groupId}
          memberDriven={config.memberDriven}
          structure={config.structure}
          onClose={() => setAddSpaceOpen(false)}
          onSaved={() => void refresh()}
        />
      ) : null}
    </OsAppScreen>
  );
}
