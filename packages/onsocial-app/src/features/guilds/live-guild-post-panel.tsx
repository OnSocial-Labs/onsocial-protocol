'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import type { PostRow } from '@onsocial/sdk';
import { Divider } from '@onsocial/ui';
import { OsAppScreen } from '@/components/app/os-app-screen';
import { AppStorageSheet } from '@/components/wallet/app-storage-sheet';
import { useAppWallet } from '@/contexts/app-wallet-context';
import { useAppTransactionFeedback } from '@/contexts/app-transaction-feedback-context';
import {
  submitPersonalRepost,
  submitPersonalUnrepost,
} from '@/features/home/submit-personal-post';
import {
  useFocusWriteDock,
  type WriteDockSubmit,
} from '@/contexts/compose-launcher-context';
import { OsWriteDockReplyChip } from '@/components/os/os-write-dock';
import { useReplyWriteDock } from '@/hooks/use-reply-write-dock';
import {
  writeDockDraftKey,
  WRITE_DOCK_ADD_REPLY_PLACEHOLDER,
} from '@/lib/os-write-dock';
import {
  clearWriteDockDraft,
  writeDockDraftFromComposer,
  writeDockExpandSeed,
  writeWriteDockDraft,
} from '@/lib/os-write-dock-draft';
import { PostCard, PostRowSkeleton, postKey } from '@/features/home/post-card';
import { ThreadDiscoverPeek } from '@/features/home/thread-discover-peek';
import { ThreadRepliesSortButton } from '@/features/home/thread-replies-sort';
import { ThreadViewQuotesRow } from '@/features/home/thread-view-quotes-row';
import { ThreadFoldButton } from '@/features/home/thread-fold-button';
import { postMetaFromText } from '@/features/home/post-mentions';
import { placesMetaFromComposer } from '@/lib/post-place';
import { seedScarceEmbedsFromSsr } from '@/features/scarces/scarce-embed-ledger';
import {
  GuildComposerSheet,
  type GuildComposerMode,
  type GuildComposerSubmit,
} from '@/features/guilds/guild-composer-sheet';
import {
  GuildMembershipJoinButton,
  guildMembershipJoinLabel,
  guildMembershipJoinPendingLabel,
} from '@/features/guilds/guild-membership-join-button';
import {
  canViewerPostInChannel,
  guildSpaceFeedChannel,
} from '@/features/guilds/guild-structure';
import { collaborativeJoinNeedsStorage } from '@/features/guilds/guild-config';
import { guildDisplayName } from '@/features/guilds/guild-card-display';
import {
  inheritedGuildReplyFeedMeta,
  parseGuildPostAudiences,
} from '@/features/guilds/guild-post-feed-meta';
import {
  collectRelayTxHashes,
  guildPath,
  guildPostPath,
  guildSheetPath,
} from '@/features/guilds/guilds-data';
import { useAppOnSocialClient } from '@/hooks/use-app-onsocial-client';
import { useUserStorageBalance } from '@/hooks/use-user-storage-balance';
import { usePostAuthorProfiles } from '@/hooks/use-post-author-profiles';
import {
  EMPTY_POST_ENGAGEMENT,
  usePostEngagement,
} from '@/hooks/use-post-engagement';
import { usePollVotes } from '@/hooks/use-poll-votes';
import { useThreadFocusReply } from '@/hooks/use-thread-focus-reply';
import { useAncestorChain, useQuotedPosts } from '@/hooks/use-quoted-posts';
import {
  resolveQuotedInset,
  collectRelationTargetAccountIds,
} from '@/lib/post-relation';
import { postQuotesPath } from '@/lib/post-routes';
import { resolveThreadLayout } from '@/lib/thread-layout';
import {
  sortThreadReplyRows,
  type ThreadReplySort,
} from '@/lib/thread-reply-sort';
import { useGuildMembershipAction } from '@/features/guilds/use-guild-membership-action';
import type { GuildMembershipOutcome } from '@/features/guilds/guild-membership-action';
import {
  GUILD_THREAD_LOAD_ERROR,
  guildThreadLoadMoreFallback,
  useGuildThreadData,
  type GuildThreadLoadMoreError,
  type GuildThreadTab,
} from '@/features/guilds/use-guild-thread-data';
import { readGuildMembershipCache } from '@/lib/guild-membership-cache';
import {
  buildReplyRows,
  flattenTreePosts,
  withoutIndexedPosts,
  type ThreadReplyRow,
} from '@/lib/thread-display';
import {
  applyMediaKindOverride,
  buildOptimisticMediaEntries,
  readPostMediaUnmuteIndex,
} from '@/lib/post-media';
import {
  normalizeComposerContentLabels,
  type PostContentLabels,
} from '@/lib/post-content-labels';
import {
  txToastConfirming,
  txToastError,
  txToastSuccess,
} from '@/lib/transaction-toast-copy';
import { isWalletUserCancellation } from '@/lib/wallet-errors';
import { playPostFocusVideo } from '@/hooks/use-post-list-video';
import type { GuildPostPageData } from '@/lib/load-guild-post-page';

interface LiveGuildPostPanelProps {
  groupId: string;
  author: string;
  postId: string;
  initial?: GuildPostPageData | null;
}

function GuildThreadLoadMoreFooter({
  tab,
  hasMore,
  loadingMore,
  loadMoreError,
  idleLabel,
  onLoadMore,
}: {
  tab: GuildThreadTab;
  hasMore: boolean;
  loadingMore: boolean;
  loadMoreError: GuildThreadLoadMoreError | null;
  idleLabel: string;
  onLoadMore: (tab: GuildThreadTab) => void;
}) {
  if (loadMoreError?.tab === tab) {
    const fallback = guildThreadLoadMoreFallback(tab);
    return (
      <div className="guild-state-card is-error">
        <p>{fallback}</p>
        {loadMoreError.message !== fallback ? (
          <small>{loadMoreError.message}</small>
        ) : null}
        <button
          className="guild-secondary-button"
          type="button"
          onClick={() => onLoadMore(tab)}
        >
          Retry
        </button>
      </div>
    );
  }
  if (!hasMore) return null;
  return (
    <button
      type="button"
      className="guild-load-more"
      disabled={loadingMore}
      onClick={() => onLoadMore(tab)}
    >
      {loadingMore ? 'Loading…' : idleLabel}
    </button>
  );
}

export function LiveGuildPostPanel({
  groupId,
  author,
  postId,
  initial = null,
}: LiveGuildPostPanelProps) {
  seedScarceEmbedsFromSsr(initial?.scarceEmbeds);
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
  const router = useRouter();
  const searchParams = useSearchParams();
  const threadLayout = resolveThreadLayout(searchParams);
  const mediaUnmuted = searchParams.get('media') === 'unmute';
  const mediaResumeIndex = readPostMediaUnmuteIndex(searchParams);
  const {
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
  } = useGuildThreadData({
    groupId,
    author,
    postId,
    initial,
    accountId,
    walletLoading,
  });
  const [modalTarget, setModalTarget] = useState<PostRow | null>(null);
  const [modalMode, setModalMode] = useState<GuildComposerMode>('quote');
  const [modalSeed, setModalSeed] = useState<{ text: string; files: File[] }>({
    text: '',
    files: [],
  });
  const [dockTarget, setDockTarget] = useState<PostRow | null>(null);
  const [modalPending, setModalPending] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);
  const [activeThreadTab, setActiveThreadTab] = useState<GuildThreadTab>(
    'replies'
  );
  const [threadTabTouched, setThreadTabTouched] = useState(false);
  const [replySort, setReplySort] = useState<ThreadReplySort>('relevant');
  const [expandedBranches, setExpandedBranches] = useState<Set<string>>(
    () => new Set()
  );
  const channelTitleById = useMemo(() => {
    if (!guildStructure) return {};
    const titles: Record<string, string> = {};
    for (const space of guildStructure.spaces) {
      titles[space.id] = space.title;
      titles[guildSpaceFeedChannel(space)] = space.title;
    }
    return titles;
  }, [guildStructure]);
  const treePosts = useMemo(() => flattenTreePosts(replyTree), [replyTree]);
  // Author's thread + folded branches as display rows, with chain-confirmed
  // local replies appended until the indexer catches up.
  const replyRows = useMemo(() => {
    const rows = buildReplyRows(
      replyTree,
      conversation.root?.accountId,
      expandedBranches
    );
    const lastPostRow = [...rows]
      .reverse()
      .find((row): row is Extract<ThreadReplyRow, { kind: 'post' }> => {
        return row.kind === 'post';
      });
    for (const local of withoutIndexedPosts(localReplies, treePosts)) {
      rows.push({
        kind: 'post',
        post: local,
        connectedToPrevious: local.accountId === lastPostRow?.post.accountId,
      });
    }
    return rows;
  }, [replyTree, conversation.root, expandedBranches, localReplies, treePosts]);
  // Total conversation size for the Replies tab badge (folded rows included).
  const replyCount = useMemo(
    () =>
      treePosts.length + withoutIndexedPosts(localReplies, treePosts).length,
    [treePosts, localReplies]
  );
  const replyFocusKey = useMemo(
    () =>
      replyRows
        .flatMap((row) => (row.kind === 'post' ? [postKey(row.post)] : []))
        .join('\n'),
    [replyRows]
  );
  const threadFocus = useThreadFocusReply(
    loadState === 'ready',
    replyFocusKey,
    {
      onFocusReply: () => {
        setActiveThreadTab('replies');
        setThreadTabTouched(true);
      },
    }
  );
  // Quotes read newest-first — your fresh quote leads the list.
  const quotes = useMemo(
    () => [
      ...withoutIndexedPosts(localQuotes, conversation.quotes),
      ...conversation.quotes,
    ],
    [conversation.quotes, localQuotes]
  );
  const threadPosts = useMemo(
    () => [
      ...(conversation.root ? [conversation.root] : []),
      ...replyRows.flatMap((row) => (row.kind === 'post' ? [row.post] : [])),
      ...quotes,
    ],
    [conversation.root, replyRows, quotes]
  );
  // Full ancestor chain up to the conversation root, oldest first.
  const ancestorChain = useAncestorChain(conversation.root?.parentPath);
  const hasParent = ancestorChain.length > 0;
  const engagementPosts = useMemo(
    () => [...ancestorChain, ...threadPosts],
    [ancestorChain, threadPosts]
  );
  const quotedPostSources = useMemo(
    () => [...threadPosts, ...ancestorChain],
    [threadPosts, ancestorChain]
  );
  const quotedPosts = useQuotedPosts(quotedPostSources);
  const postAuthorIds = useMemo(() => {
    const ids = new Set<string>();
    for (const post of threadPosts) ids.add(post.accountId);
    for (const post of Object.values(quotedPosts)) ids.add(post.accountId);
    for (const post of ancestorChain) ids.add(post.accountId);
    for (const targetId of collectRelationTargetAccountIds(threadPosts)) {
      ids.add(targetId);
    }
    for (const targetId of collectRelationTargetAccountIds(ancestorChain)) {
      ids.add(targetId);
    }
    return Array.from(ids);
  }, [threadPosts, quotedPosts, ancestorChain]);
  const postAuthorProfiles = usePostAuthorProfiles(postAuthorIds);
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

  // Indexer quote total — the loaded page is capped at THREAD_QUOTE_PAGE_SIZE.
  const rootEngagement = conversation.root
    ? engagement[postKey(conversation.root)]
    : undefined;
  const quoteTotal = Math.max(rootEngagement?.quoteCount ?? 0, quotes.length);
  const sortedReplyRows = useMemo(
    () => sortThreadReplyRows(replyRows, replySort, engagement),
    [replyRows, replySort, engagement]
  );

  useEffect(() => {
    setActiveThreadTab('replies');
    setThreadTabTouched(false);
  }, [rootPath]);

  useEffect(() => {
    if (threadLayout !== 'tabs' || threadTabTouched) return;
    if (
      activeThreadTab === 'replies' &&
      replyCount === 0 &&
      quotes.length > 0
    ) {
      setActiveThreadTab('quotes');
    }
  }, [
    activeThreadTab,
    quotes.length,
    replyCount,
    threadLayout,
    threadTabTouched,
  ]);

  useEffect(() => {
    if (!mediaUnmuted) return;
    playPostFocusVideo(mediaResumeIndex);
  }, [mediaUnmuted, mediaResumeIndex, conversation.root?.postId]);

  const threadChannel = conversation.root?.channel;
  const canPostInChannel = useCallback(
    (channel: string | null | undefined) =>
      guildStructure
        ? canViewerPostInChannel(guildStructure, channel, viewerAccess)
        : false,
    [guildStructure, viewerAccess]
  );
  const canPostInThread = canPostInChannel(threadChannel);

  const performSubmit = async (
    target: PostRow,
    mode: GuildComposerMode,
    text: string,
    files: File[] = [],
    contentLabels: PostContentLabels = {},
    places?: string[]
  ): Promise<{ confirmed: boolean; newPostId: string }> => {
    const newPostId = Date.now().toString();
    const { client } = await getClient();
    const ref = {
      author: target.accountId,
      groupId,
      postId: target.postId,
    };
    const feedMeta = applyMediaKindOverride(
      inheritedGuildReplyFeedMeta(target, {
        fallbackChannel: threadChannel,
        fallbackKind: conversation.root?.kind ?? null,
        fallbackAudiences: conversation.root
          ? parseGuildPostAudiences(conversation.root.audiences)
          : undefined,
      }),
      files
    );
    const tagPayload = {
      ...postMetaFromText(text),
      ...placesMetaFromComposer(places),
    };
    const postData = {
      text,
      access: 'group' as const,
      groupId,
      timestamp: Date.now(),
      ...tagPayload,
      ...feedMeta,
      ...contentLabels,
      ...(files.length ? { files } : {}),
    };
    const response =
      mode === 'quote'
        ? await client.groups.quotePost(groupId, ref, postData, newPostId)
        : await client.groups.replyToPost(groupId, ref, postData, newPostId);
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
    return { confirmed, newPostId };
  };

  const insertConfirmedRootChild = (
    mode: GuildComposerMode,
    text: string,
    newPostId: string,
    files: File[] = [],
    contentLabels: PostContentLabels = {},
    places?: string[]
  ) => {
    if (!accountId) return;
    const feedMeta = applyMediaKindOverride(
      conversation.root ? inheritedGuildReplyFeedMeta(conversation.root) : {},
      files
    );
    const tagPayload = {
      ...postMetaFromText(text),
      ...placesMetaFromComposer(places),
    };
    const media = files.length ? buildOptimisticMediaEntries(files) : undefined;
    // Chain-confirmed; show immediately while the indexer catches up.
    const confirmedRow: PostRow = {
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
      ...feedMeta,
      ...(mode === 'quote'
        ? { refAuthor: author, refPath: rootPath, refType: 'post' }
        : {
            parentAuthor: author,
            parentPath: rootPath,
            parentType: 'post',
          }),
    };
    if (mode === 'quote') {
      setLocalQuotes((current) => [...current, confirmedRow]);
    } else {
      setLocalReplies((current) => [...current, confirmedRow]);
      threadFocus.requestFocus(confirmedRow);
    }
    setActiveThreadTab(mode === 'quote' ? 'quotes' : 'replies');
    setThreadTabTouched(true);
    scheduleReconcile();
  };

  const openComposerModal = (mode: GuildComposerMode) => (target: PostRow) => {
    setModalMode(mode);
    setModalError(null);
    setModalTarget(target);
  };

  const submitFromModal = async (payload: GuildComposerSubmit) => {
    const target = modalTarget;
    const text = payload.text.trim();
    const files = payload.files ?? [];
    const contentLabels = normalizeComposerContentLabels(payload);
    if (!target || modalPending || (!text && !files.length)) return;

    const channel = target.channel ?? threadChannel;
    if (!canPostInChannel(channel)) {
      setModalError('You cannot reply in this room.');
      return;
    }

    if (!isConnected || !accountId) {
      await connect();
      return;
    }

    setModalError(null);
    setModalPending(true);
    try {
      const { confirmed, newPostId } = await performSubmit(
        target,
        modalMode,
        text,
        files,
        contentLabels,
        payload.places
      );
      if (confirmed) {
        const targetsRoot =
          conversation.root && postKey(target) === postKey(conversation.root);
        if (targetsRoot) {
          insertConfirmedRootChild(
            modalMode,
            text,
            newPostId,
            files,
            contentLabels,
            payload.places
          );
        } else {
          scheduleReconcile();
        }
        if (modalMode === 'reply') {
          clearWriteDockDraft(writeDockDraftKey('post', postKey(target)));
        }
        setModalTarget(null);
        setModalSeed({ text: '', files: [] });
      }
    } catch (cause) {
      if (isWalletUserCancellation(cause)) return;
      setModalError(
        cause instanceof Error
          ? cause.message
          : modalMode === 'quote'
            ? 'Could not quote this post.'
            : 'Could not reply to this post.'
      );
    } finally {
      setModalPending(false);
    }
  };

  const focusWriteDock = useFocusWriteDock();
  const replyHandler = (post: PostRow) => {
    const channel = post.channel ?? threadChannel;
    if (accountId && !canPostInChannel(channel)) return;
    setDockTarget(post);
    focusWriteDock();
  };
  const quoteHandler = canPostInThread
    ? (post: PostRow) => {
        const channel = post.channel ?? threadChannel;
        if (!canPostInChannel(channel)) return;
        setModalSeed({ text: '', files: [] });
        openComposerModal('quote')(post);
      }
    : undefined;
  const expandReply = (post: PostRow, payload: WriteDockSubmit) => {
    const channel = post.channel ?? threadChannel;
    if (accountId && !canPostInChannel(channel)) return;
    const draftKey = threadDraftKey ?? writeDockDraftKey('post', postKey(post));
    const seed = writeDockExpandSeed(draftKey, payload);
    setModalSeed({ text: seed.initialText, files: seed.initialFiles });
    openComposerModal('reply')(post);
  };
  const repostHandler = canPostInThread
    ? (post: PostRow) => {
        const channel = post.channel ?? threadChannel;
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
  const undoRepostHandler = canPostInThread
    ? (post: PostRow) => {
        const viewer = engagement[postKey(post)];
        const viewerRepostId = viewer?.viewerRepostId;
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
                groupId: viewer.viewerRepostGroupId,
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

  /** Click-through target for a quoted post's own thread page. */
  const quotedHrefFor = (quoted: PostRow | undefined) =>
    quoted
      ? guildPostPath(
          quoted.groupId ?? groupId,
          quoted.accountId,
          quoted.postId
        )
      : undefined;

  const root = conversation.root;
  const writeTarget = dockTarget ?? root;
  const nestedDockReply = Boolean(
    root && writeTarget && postKey(writeTarget) !== postKey(root)
  );
  const writeName = writeTarget
    ? postAuthorProfiles[writeTarget.accountId]?.displayName
    : null;
  const threadDraftKey = root
    ? writeDockDraftKey('post', postKey(root))
    : undefined;
  const writeAbove = nestedDockReply ? (
    <OsWriteDockReplyChip
      label={writeName?.trim() || 'this post'}
      onCancel={() => setDockTarget(null)}
    />
  ) : null;
  useReplyWriteDock({
    target: writeTarget,
    enabled: Boolean(root) && (!accountId || canPostInThread),
    disabled: Boolean(modalTarget),
    placeholder: WRITE_DOCK_ADD_REPLY_PLACEHOLDER,
    above: writeAbove,
    revision: writeTarget ? postKey(writeTarget) : '',
    draftKey: threadDraftKey,
    onExpand: writeTarget
      ? (payload) => expandReply(writeTarget, payload)
      : undefined,
    onConfirmed: (reply, target) => {
      if (conversation.root && postKey(target) === postKey(conversation.root)) {
        setLocalReplies((current) => [...current, reply]);
        threadFocus.requestFocus(reply);
        setActiveThreadTab('replies');
        setThreadTabTouched(true);
      }
      scheduleReconcile();
      setDockTarget(null);
    },
  });

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
    ? isMember
    : Boolean(membershipHint?.isMember);
  const effectiveJoinPending = viewerAccessResolved
    ? joinPending
    : Boolean(membershipHint?.joinPending);
  const effectiveIsOwner = viewerAccessResolved ? viewerAccess.isOwner : false;
  const effectiveIsBlacklisted = viewerAccessResolved ? isBlacklisted : false;
  const needsCollaborativeStorage = collaborativeJoinNeedsStorage({
    memberDriven,
    isMember: effectiveIsMember,
    joinPending: effectiveJoinPending,
    availableYocto: userStorage.summary?.availableYocto,
  });
  // Keep ready through Leave?/Transfer? confirm — danger mutes when !ready.
  const membershipActionReady = effectiveIsMember
    ? true
    : effectiveIsBlacklisted
      ? false
      : effectiveJoinPending
        ? joinCancelReady
        : !isConnected || (viewerAccessResolved && !effectiveIsMember);

  const membershipSnapshot = useMemo(
    () => ({
      isMember: effectiveIsMember,
      joinPending: effectiveJoinPending,
      isOwner: effectiveIsOwner,
      isBlacklisted: effectiveIsBlacklisted,
      accessGated,
      memberDriven,
      pendingJoinProposalId,
      joinCancelReady,
    }),
    [
      accessGated,
      effectiveIsBlacklisted,
      effectiveIsMember,
      effectiveIsOwner,
      effectiveJoinPending,
      joinCancelReady,
      memberDriven,
      pendingJoinProposalId,
    ]
  );

  const handleMembershipConfirmed = useCallback(
    (outcome: GuildMembershipOutcome) => {
      applyMembershipOutcome(outcome);
      void refresh({ background: true });
    },
    [applyMembershipOutcome, refresh]
  );

  const handleOwnerManage = useCallback(() => {
    router.push(guildSheetPath(groupId, 'members'));
  }, [groupId, router]);

  const {
    confirmingLeave,
    actionPending: joinActionPending,
    clearConfirmLeave,
    handleMembershipClick: runMembershipClick,
  } = useGuildMembershipAction({
    groupId,
    snapshot: membershipSnapshot,
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

  const membershipActionLabel = guildMembershipJoinLabel({
    isConnected,
    accessGated,
    joinPending: effectiveJoinPending,
    joinCancelReady,
    isMember: effectiveIsMember,
    isOwner: effectiveIsOwner,
    isBlacklisted: effectiveIsBlacklisted,
    confirmingLeave,
    needsStorage: needsCollaborativeStorage,
  });

  const membershipActions = (
    <div className="guild-hero-membership-slot guild-thread-nav-membership-slot">
      {membershipChromePending ? (
        <span aria-busy="true" aria-label="Loading membership">
          <span
            className="standing-row-shimmer guild-thread-nav-membership-shimmer"
            aria-hidden
          />
        </span>
      ) : (
        <GuildMembershipJoinButton
          className="guild-hero-membership guild-thread-nav-membership"
          label={membershipActionLabel}
          ready={membershipActionReady}
          active={effectiveIsMember && !confirmingLeave}
          pending={joinActionPending}
          pendingLabel={guildMembershipJoinPendingLabel({
            accessGated,
            canceling: effectiveJoinPending,
            leaving: effectiveIsMember,
          })}
          variant={confirmingLeave ? 'danger' : 'primary'}
          disabled={
            effectiveIsBlacklisted ||
            (effectiveJoinPending && !joinCancelReady) ||
            (!viewerAccessResolved && Boolean(membershipHint))
          }
          onClick={handleMembershipClick}
          onBlur={confirmingLeave ? clearConfirmLeave : undefined}
        />
      )}
    </div>
  );

  const replyListRows = sortedReplyRows.map((row, index) => {
    if (row.kind === 'more') {
      return (
        <ThreadFoldButton
          key={`more-${row.branchKey}`}
          onClick={() =>
            setExpandedBranches((current) =>
              new Set(current).add(row.branchKey)
            )
          }
        >
          {row.hiddenCount === 1
            ? 'Show 1 more reply'
            : `Show ${row.hiddenCount} more replies`}
        </ThreadFoldButton>
      );
    }

    const next = sortedReplyRows[index + 1];
    const connectedToNext =
      next !== undefined &&
      (next.kind === 'more' ||
        (next.kind === 'post' && next.connectedToPrevious));
    const itemClassName = [
      'post-thread-item',
      row.connectedToPrevious
        ? 'post-thread-item--up post-thread-item--cont'
        : '',
      connectedToNext ? 'post-thread-item--down' : '',
      threadFocus.isHighlighted(row.post)
        ? 'post-thread-item--focus-reply'
        : '',
    ]
      .filter(Boolean)
      .join(' ');

    return (
      <div key={postKey(row.post)}>
        {index > 0 && !row.connectedToPrevious ? (
          <Divider variant="item" className="post-row-divider" />
        ) : null}
        <div
          className={itemClassName}
          data-thread-focus-reply={row.post.postId}
          data-thread-focus-key={postKey(row.post)}
        >
          <PostCard
            post={row.post}
            authorProfile={postAuthorProfiles[row.post.accountId]}
            actionHref={guildPostPath(
              groupId,
              row.post.accountId,
              row.post.postId
            )}
            // Position under the root already says "reply".
            showRelationBadge={false}
            className={
              row.connectedToPrevious ? 'post-card--chain-cont' : undefined
            }
            engagement={engagement[postKey(row.post)]}
            reactionPending={isReactionPending(row.post)}
            savePending={isSavePending(row.post)}
            sharePending={isSharePending(row.post)}
            onToggleReaction={toggleReaction}
            onToggleSave={toggleSave}
            onAmplifyConfirmed={confirmAmplify}
            onReply={replyHandler}
            onExpandReply={expandReply}
            onQuote={quoteHandler}
            onRepost={repostHandler}
            onUndoRepost={undoRepostHandler}
            pollTally={pollTallyFor(row.post)}
            pollVotePending={isPollVotePending(row.post)}
            onPollVote={(post, optionIndex) => {
              void castVote(post, optionIndex);
            }}
          />
        </div>
      </div>
    );
  });

  const quoteListRows = quotes.map((quote, index) => {
    const quoted = resolveQuotedInset(quote, quotedPosts, conversation.root);
    return (
      <div key={postKey(quote)}>
        <Divider
          variant="item"
          className={
            index > 0
              ? 'post-row-divider'
              : 'post-row-divider post-row-divider--leading-hidden'
          }
        />
        <PostCard
          post={quote}
          authorProfile={postAuthorProfiles[quote.accountId]}
          actionHref={guildPostPath(groupId, quote.accountId, quote.postId)}
          showRelationBadge={false}
          quotedPost={quoted}
          quotedAuthorProfile={
            quoted ? postAuthorProfiles[quoted.accountId] : undefined
          }
          quotedHref={quotedHrefFor(quoted)}
          engagement={engagement[postKey(quote)]}
          reactionPending={isReactionPending(quote)}
          savePending={isSavePending(quote)}
          sharePending={isSharePending(quote)}
          onToggleReaction={toggleReaction}
          onToggleSave={toggleSave}
          onAmplifyConfirmed={confirmAmplify}
          onReply={replyHandler}
          onExpandReply={expandReply}
          onQuote={quoteHandler}
          onRepost={repostHandler}
          onUndoRepost={undoRepostHandler}
          pollTally={pollTallyFor(quote)}
          pollVotePending={isPollVotePending(quote)}
          onPollVote={(post, optionIndex) => {
            void castVote(post, optionIndex);
          }}
        />
      </div>
    );
  });

  return (
    <OsAppScreen
      title={guildDisplayName(guildName, groupId)}
      titleHref={guildPath(groupId)}
      dockBack
      backFallbackHref={guildPath(groupId)}
      actions={membershipActions}
    >
      <div className="guilds-page">
        {loadState === 'loading' ? <PostRowSkeleton rows={4} /> : null}

        {loadState === 'missing' ? (
          <section className="guild-state-card">
            <p>We could not find this guild post in the indexed feed yet.</p>
            <button
              className="guild-secondary-button"
              type="button"
              onClick={() => void refresh()}
            >
              Retry
            </button>
          </section>
        ) : null}

        {loadState === 'error' ? (
          <section className="guild-state-card is-error">
            <p>{error ?? GUILD_THREAD_LOAD_ERROR}</p>
            <button
              className="guild-secondary-button"
              type="button"
              onClick={() => void refresh()}
            >
              Retry
            </button>
          </section>
        ) : null}

        {loadState === 'ready' && conversation.root ? (
          <section className="guild-thread-column">
            <div className="guild-thread-context">
              {ancestorChain.map((ancestor, index) => (
                <div
                  className={`guild-thread-ancestor post-thread-item post-thread-item--down${index > 0 ? ' post-thread-item--up' : ''}`}
                  key={postKey(ancestor)}
                >
                  <PostCard
                    post={ancestor}
                    authorProfile={postAuthorProfiles[ancestor.accountId]}
                    actionHref={guildPostPath(
                      groupId,
                      ancestor.accountId,
                      ancestor.postId
                    )}
                    // Top of chain keeps its context line if truncated.
                    showRelationBadge={index === 0}
                    authorProfiles={postAuthorProfiles}
                    quotedPost={
                      ancestor.refPath
                        ? quotedPosts[ancestor.refPath]
                        : undefined
                    }
                    quotedAuthorProfile={
                      ancestor.refPath
                        ? postAuthorProfiles[
                            quotedPosts[ancestor.refPath]?.accountId ?? ''
                          ]
                        : undefined
                    }
                    quotedHref={quotedHrefFor(
                      ancestor.refPath
                        ? quotedPosts[ancestor.refPath]
                        : undefined
                    )}
                    engagement={
                      engagement[postKey(ancestor)] ?? EMPTY_POST_ENGAGEMENT
                    }
                    reactionPending={isReactionPending(ancestor)}
                    savePending={isSavePending(ancestor)}
                    sharePending={isSharePending(ancestor)}
                    onToggleReaction={toggleReaction}
                    onToggleSave={toggleSave}
                    onAmplifyConfirmed={confirmAmplify}
                    onReply={replyHandler}
                    onExpandReply={expandReply}
                    onQuote={quoteHandler}
                    onRepost={repostHandler}
                    onUndoRepost={undoRepostHandler}
                    pollTally={pollTallyFor(ancestor)}
                    pollVotePending={isPollVotePending(ancestor)}
                    onPollVote={(post, optionIndex) => {
                      void castVote(post, optionIndex);
                    }}
                  />
                </div>
              ))}

              <div
                className={`guild-thread-root${hasParent ? ' post-thread-item post-thread-item--up' : ''}`}
              >
                <PostCard
                  post={conversation.root}
                  authorProfile={
                    postAuthorProfiles[conversation.root.accountId]
                  }
                  mediaFocused
                  mediaUnmuted={mediaUnmuted}
                  mediaResumeIndex={mediaResumeIndex}
                  detailLayout
                  // Parent drawn above with a chain line already says "reply".
                  showRelationBadge={!hasParent}
                  authorProfiles={postAuthorProfiles}
                  // Thread is reached from anywhere — root keeps channel context.
                  showChannel
                  channelLabel={
                    conversation.root.channel
                      ? (channelTitleById[conversation.root.channel] ??
                        conversation.root.channel)
                      : undefined
                  }
                  quotedPost={
                    conversation.root.refPath
                      ? quotedPosts[conversation.root.refPath]
                      : undefined
                  }
                  quotedAuthorProfile={
                    conversation.root.refPath
                      ? postAuthorProfiles[
                          quotedPosts[conversation.root.refPath]?.accountId ??
                            ''
                        ]
                      : undefined
                  }
                  quotedHref={quotedHrefFor(
                    conversation.root.refPath
                      ? quotedPosts[conversation.root.refPath]
                      : undefined
                  )}
                  engagement={
                    engagement[postKey(conversation.root)] ??
                    EMPTY_POST_ENGAGEMENT
                  }
                  reactionPending={isReactionPending(conversation.root)}
                  savePending={isSavePending(conversation.root)}
                  sharePending={isSharePending(conversation.root)}
                  onToggleReaction={toggleReaction}
                  onToggleSave={toggleSave}
                  onAmplifyConfirmed={confirmAmplify}
                  onReply={replyHandler}
                  onExpandReply={expandReply}
                  onQuote={quoteHandler}
                  onRepost={repostHandler}
                  onUndoRepost={undoRepostHandler}
                  pollTally={pollTallyFor(conversation.root)}
                  pollVotePending={isPollVotePending(conversation.root)}
                  onPollVote={(post, optionIndex) => {
                    void castVote(post, optionIndex);
                  }}
                />
              </div>
            </div>

            <Divider variant="detail" />

            {threadLayout === 'tabs' ? (
              <div className="guild-thread-chrome">
                <div
                  className="guild-thread-tabs"
                  role="tablist"
                  aria-label="Discussion content"
                >
                  <button
                    type="button"
                    role="tab"
                    id="guild-thread-tab-replies"
                    aria-controls="guild-thread-panel"
                    aria-selected={activeThreadTab === 'replies'}
                    className={
                      activeThreadTab === 'replies' ? 'is-active' : undefined
                    }
                    onClick={() => {
                      setThreadTabTouched(true);
                      setActiveThreadTab('replies');
                    }}
                  >
                    Replies
                    <span className="guild-thread-tab-count">{replyCount}</span>
                  </button>
                  <button
                    type="button"
                    role="tab"
                    id="guild-thread-tab-quotes"
                    aria-controls="guild-thread-panel"
                    aria-selected={activeThreadTab === 'quotes'}
                    className={
                      activeThreadTab === 'quotes' ? 'is-active' : undefined
                    }
                    onClick={() => {
                      setThreadTabTouched(true);
                      setActiveThreadTab('quotes');
                    }}
                  >
                    Quotes
                    <span className="guild-thread-tab-count">
                      {quotes.length}
                    </span>
                  </button>
                </div>
              </div>
            ) : replyListRows.length > 0 || quoteTotal > 0 ? (
              <div className="thread-controls-row">
                {replyListRows.length > 0 ? (
                  <ThreadRepliesSortButton
                    sort={replySort}
                    onChange={setReplySort}
                  />
                ) : (
                  <span className="thread-controls-spacer" aria-hidden />
                )}
                {quoteTotal > 0 && conversation.root ? (
                  <ThreadViewQuotesRow
                    href={postQuotesPath(conversation.root)}
                    quoteCount={quoteTotal}
                  />
                ) : null}
              </div>
            ) : null}

            {threadLayout === 'tabs' ? (
              <div
                id="guild-thread-panel"
                className="guild-connected-stack"
                role="tabpanel"
                aria-labelledby={
                  activeThreadTab === 'replies'
                    ? 'guild-thread-tab-replies'
                    : 'guild-thread-tab-quotes'
                }
              >
                {activeThreadTab === 'replies' ? (
                  replyListRows.length > 0 ? (
                    replyListRows
                  ) : (
                    <div className="guild-state-card">No replies yet.</div>
                  )
                ) : quoteListRows.length > 0 ? (
                  quoteListRows
                ) : (
                  <div className="guild-state-card">No quotes yet.</div>
                )}

                <GuildThreadLoadMoreFooter
                  tab={activeThreadTab}
                  hasMore={
                    activeThreadTab === 'replies'
                      ? hasMoreReplies
                      : hasMoreQuotes
                  }
                  loadingMore={loadingMore}
                  loadMoreError={loadMoreError}
                  idleLabel={
                    activeThreadTab === 'replies'
                      ? 'Show more replies'
                      : 'Show more quotes'
                  }
                  onLoadMore={loadMore}
                />
              </div>
            ) : (
              <div className="guild-connected-stack">
                {replyListRows.length > 0 ? (
                  replyListRows
                ) : quoteTotal === 0 ? (
                  <ThreadDiscoverPeek
                    author={author}
                    excludePostId={postId}
                    authorProfiles={postAuthorProfiles}
                  />
                ) : null}

                <GuildThreadLoadMoreFooter
                  tab="replies"
                  hasMore={hasMoreReplies}
                  loadingMore={loadingMore}
                  loadMoreError={loadMoreError}
                  idleLabel="Show more replies"
                  onLoadMore={loadMore}
                />
              </div>
            )}
          </section>
        ) : null}
      </div>
      {modalTarget ? (
        <GuildComposerSheet
          key={`${postKey(modalTarget)}:${modalSeed.files
            .map((file) => `${file.name}:${file.size}:${file.lastModified}`)
            .join('|')}`}
          open
          target={modalTarget}
          targetAuthorProfile={postAuthorProfiles[modalTarget.accountId]}
          mode={modalMode}
          onModeChange={setModalMode}
          initialText={modalSeed.text}
          initialFiles={modalSeed.files}
          pending={modalPending}
          error={modalError}
          onClose={(draft) => {
            if (modalPending) return;
            if (modalMode === 'reply' && draft) {
              const persistKey =
                threadDraftKey &&
                writeTarget &&
                postKey(modalTarget) === postKey(writeTarget)
                  ? threadDraftKey
                  : writeDockDraftKey('post', postKey(modalTarget));
              writeWriteDockDraft(
                persistKey,
                writeDockDraftFromComposer(draft)
              );
            }
            setModalTarget(null);
            setModalSeed({ text: '', files: [] });
            if (modalMode === 'reply' && draft?.text.trim()) {
              focusWriteDock();
            }
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
    </OsAppScreen>
  );
}
