'use client';

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type RefObject,
} from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import type { PostRow } from '@onsocial/sdk';
import { Divider, PulsingDots } from '@onsocial/ui';
import { OsAppScreen } from '@/components/app/os-app-screen';
import { OsHeaderBack } from '@/components/app/os-header-back';
import { OsRouteSettle } from '@/components/app/os-route-settle';
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
import { useInfiniteScrollSentinel } from '@/hooks/use-infinite-scroll-sentinel';
import {
  writeDockDraftKey,
  WRITE_DOCK_ADD_REPLY_PLACEHOLDER,
  writeDockReplyPreview,
  writeDockReplySpokenName,
} from '@/lib/os-write-dock';
import { GUILDS_PAGE_CLASS } from '@/lib/os-chrome-page';
import { OsEmptyAction } from '@/lib/os-empty-action';
import {
  clearWriteDockDraft,
  writeDockDraftFromComposer,
  writeDockExpandSeed,
  writeWriteDockDraft,
} from '@/lib/os-write-dock-draft';
import { postKey } from '@/features/home/post-card';
import { ResolvedFeedPostCard } from '@/features/home/resolved-feed-post-card';
import {
  PostRowSkeleton,
  PostThreadPageSkeleton,
} from '@/features/home/post-skeleton';
import { ThreadRail } from '@/features/home/thread-rail';
import { ThreadDiscoverPeek } from '@/features/home/thread-discover-peek';
import { ThreadRepliesSortButton } from '@/features/home/thread-replies-sort';
import { ThreadViewQuotesRow } from '@/features/home/thread-view-quotes-row';
import { ThreadFoldLink } from '@/features/home/thread-fold-button';
import { postMetaFromText } from '@/features/home/post-mentions';
import { placesMetaFromComposer } from '@/lib/post-place';
import { dispatchPersonalQuoteConfirmed } from '@/features/scarces/drop-compose-host';
import { seedScarceEmbedsFromSsr } from '@/features/scarces/scarce-embed-ledger';
import {
  ComposerSheet,
  type ComposerMode,
  type ComposerSubmit,
} from '@/features/guilds/guild-composer-sheet';
import {
  GuildMembershipConfirmDrawer,
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
import {
  seedPostAuthorProfilesFromFeed,
  usePostAuthorProfiles,
} from '@/hooks/use-post-author-profiles';
import { usePostEngagement } from '@/hooks/use-post-engagement';
import { usePollVotes } from '@/hooks/use-poll-votes';
import { useThreadLandAppear } from '@/hooks/use-land-opened-post';
import {
  threadControlPresenceClass,
  threadCoverReady,
} from '@/lib/thread-open';
import { useThreadFocusReply } from '@/hooks/use-thread-focus-reply';
import {
  asAncestorChainState,
  useAncestorChain,
  useQuotedPosts,
} from '@/hooks/use-quoted-posts';
import { collectRelationTargetAccountIds } from '@/lib/post-relation';
import { postQuotesPath } from '@/lib/post-routes';
import {
  resolveThreadShareRow,
  threadShareRowHref,
} from '@/lib/thread-share-row';
import {
  sortThreadReplyRows,
  type ThreadReplySort,
} from '@/lib/thread-reply-sort';
import { useGuildMembershipAction } from '@/features/guilds/use-guild-membership-action';
import type { GuildMembershipOutcome } from '@/features/guilds/guild-membership-action';
import {
  GUILD_THREAD_LOAD_ERROR,
  GUILD_THREAD_LOAD_MORE_REPLIES_ERROR,
  useGuildThreadData,
} from '@/features/guilds/use-guild-thread-data';
import { readGuildMembershipCache } from '@/lib/guild-membership-cache';
import {
  buildReplyRows,
  flattenTreePosts,
  threadReplyRowKey,
  threadRootContinued,
  withoutIndexedPosts,
  type ThreadReplyRow,
} from '@/lib/thread-display';
import { threadReplyRowEstimatePx } from '@/features/home/feed-block-estimate';
import { useFeedWindow } from '@/features/home/use-feed-window';
import { THREAD_ANCHOR_QUERY } from '@/features/home/home-feed-scroll-anchor';
import { resolveThreadFoldLabel } from '@/lib/thread-fold-label';
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
import { usePostLayerOwnerZ } from '@/features/home/post-layer-owner-z';
import { postLayerOverlayZ } from '@/lib/sheet-z';
import type { ThreadSheetContext } from '@/lib/guild-thread-card-context';
import type { PostEngagementMap } from '@/lib/feed-paint-hydrate';
import type { GuildPostPageData } from '@/lib/load-guild-post-page';
import { threadRootRevisionLabel } from '@/lib/row-seed-root';

interface LiveGuildPostPanelProps {
  groupId: string;
  author: string;
  postId: string;
  initial?: GuildPostPageData | null;
  /** Sheet over a feed. The sheet already supplies the Post header. */
  embedded?: boolean;
  /** False while the sheet is parked under a profile. */
  replyDockEnabled?: boolean;
  /** Covered trail sheet — freeze land/scroll for identity back. */
  parked?: boolean;
  /** Muted guild name above the author. Off when this guild is already the screen. */
  showGuildLine?: boolean;
  /** Room line on the opened post. Off inside one room. */
  showChannel?: boolean;
  /** Passed to posts opened from this thread. */
  sheetContext?: ThreadSheetContext | null;
  /** Sheet appear waits until the opened post is on screen. */
  onThreadPainted?: () => void;
}

function GuildThreadLoadMoreFooter({
  hasMore,
  loadingMore,
  loadMoreError,
  onLoadMore,
  sentinelRef,
}: {
  hasMore: boolean;
  loadingMore: boolean;
  loadMoreError: string | null;
  onLoadMore: () => void;
  sentinelRef: RefObject<HTMLDivElement | null>;
}) {
  if (loadMoreError) {
    return (
      <div className="guild-state-card is-error">
        <p>{GUILD_THREAD_LOAD_MORE_REPLIES_ERROR}</p>
        {loadMoreError !== GUILD_THREAD_LOAD_MORE_REPLIES_ERROR ? (
          <small>{loadMoreError}</small>
        ) : null}
        <OsEmptyAction onClick={onLoadMore}>Retry</OsEmptyAction>
      </div>
    );
  }
  if (!hasMore && !loadingMore) return null;
  return (
    <div className="dao-discover-load-more">
      <div ref={sentinelRef} className="protocol-feed-sentinel" aria-hidden />
      {loadingMore ? (
        <div className="list-append-pending">
          <PulsingDots size="sm" label="Loading more" />
        </div>
      ) : null}
    </div>
  );
}

export function LiveGuildPostPanel({
  groupId,
  author,
  postId,
  initial = null,
  embedded = false,
  replyDockEnabled = true,
  parked = false,
  showGuildLine = true,
  showChannel: showRoom = true,
  sheetContext = null,
  onThreadPainted,
}: LiveGuildPostPanelProps) {
  seedScarceEmbedsFromSsr(initial?.scarceEmbeds);
  if (initial?.root) seedPostAuthorProfilesFromFeed([initial.root]);
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
  const ownerZ = usePostLayerOwnerZ();
  const mediaUnmuted = searchParams.get('media') === 'unmute';
  const mediaResumeIndex = readPostMediaUnmuteIndex(searchParams);
  /*
   * The hook writes session snapshots after fetches; it reads the live
   * engagement map through this ref so cached counts match what painted.
   */
  const engagementLatestRef = useRef<PostEngagementMap | null>(null);
  const {
    loadState,
    error,
    rootRevision,
    repliesResolved,
    shareTailReady,
    seededEngagement,
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
  } = useGuildThreadData({
    groupId,
    author,
    postId,
    initial,
    accountId,
    walletLoading,
    engagementLatestRef,
  });
  const [modalTarget, setModalTarget] = useState<PostRow | null>(null);
  const [modalMode, setModalMode] = useState<ComposerMode>('quote');
  const [modalSeed, setModalSeed] = useState<{ text: string; files: File[] }>({
    text: '',
    files: [],
  });
  const [dockTarget, setDockTarget] = useState<PostRow | null>(null);
  const [modalPending, setModalPending] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);
  const [replySort, setReplySort] = useState<ThreadReplySort>('relevant');
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
    const rows = buildReplyRows(replyTree, conversation.root?.accountId);
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
  }, [replyTree, conversation.root, localReplies, treePosts]);
  const replyFocusKey = useMemo(
    () =>
      replyRows
        .flatMap((row) => (row.kind === 'post' ? [postKey(row.post)] : []))
        .join('\n'),
    [replyRows]
  );
  // Fold labels flag the thread author as the notable name in mixed folds.
  const foldNotableIds = useMemo(() => {
    const rootAuthorId = conversation.root?.accountId;
    return rootAuthorId ? new Set([rootAuthorId]) : undefined;
  }, [conversation.root?.accountId]);
  const threadFocus = useThreadFocusReply(loadState === 'ready', replyFocusKey);
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
  const parentPath = conversation.root?.parentPath;
  const { ancestors: ancestorChain, ready: ancestorsReady } =
    asAncestorChainState(useAncestorChain(parentPath));
  const hasParent = Boolean(parentPath);
  const hasAncestorRows = ancestorChain.length > 0;
  const openedPostRef = useRef<HTMLDivElement>(null);
  const threadHostRef = useRef<HTMLDivElement | null>(null);
  const threadScrollRef = useRef<HTMLElement | null>(null);
  const replyLoadMoreRef = useRef<HTMLDivElement | null>(null);
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
    initial: seededEngagement,
    onError: (message) => setTxResult({ type: 'error', msg: message }),
  });
  engagementLatestRef.current = engagement;
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
  const repostTotal = Math.max(0, rootEngagement?.repostCount ?? 0);
  const shareRow = resolveThreadShareRow(quoteTotal, repostTotal);
  const rootEngagementKey = conversation.root
    ? postKey(conversation.root)
    : null;
  const emptyTailReady =
    shareTailReady &&
    (rootEngagementKey == null ||
      Boolean(
        seededEngagement?.[rootEngagementKey] || engagement[rootEngagementKey]
      ));
  useThreadLandAppear({
    openedPostRef,
    postId: conversation.root?.postId,
    hasParent,
    ancestorsReady,
    loadReady: loadState === 'ready',
    hasRoot: Boolean(conversation.root),
    pinKey: ancestorsReady
      ? ancestorChain.map((post) => post.postId).join('\n')
      : '',
    parked,
    onThreadPainted,
  });
  const permalinkReady = threadCoverReady({
    loadState,
    hasRoot: Boolean(conversation.root),
    repliesResolved,
  });
  const sortedReplyRows = useMemo(
    () => sortThreadReplyRows(replyRows, replySort, engagement),
    [replyRows, replySort, engagement]
  );

  /*
   * Reply windowing — same integration as the personal thread panel: past
   * the row threshold, far rows collapse into spacers; the deep-link focus
   * target stays pinned mounted while its retry loop looks for it.
   */
  const replyRowKeys = useMemo(
    () => sortedReplyRows.map(threadReplyRowKey),
    [sortedReplyRows]
  );
  const replyRowEstimates = useMemo(
    () =>
      sortedReplyRows.map((row) => threadReplyRowEstimatePx(row, quotedPosts)),
    [sortedReplyRows, quotedPosts]
  );
  const replyStackRef = useRef<HTMLDivElement | null>(null);
  const focusPinKey = useMemo(() => {
    const pending = threadFocus.pendingPostId;
    if (!pending) return null;
    for (let index = 0; index < sortedReplyRows.length; index += 1) {
      const row = sortedReplyRows[index]!;
      if (row.kind === 'post' && row.post.postId === pending) {
        return replyRowKeys[index]!;
      }
    }
    return null;
  }, [sortedReplyRows, replyRowKeys, threadFocus.pendingPostId]);
  const {
    windowed: replyWindowed,
    start: replyWindowStart,
    end: replyWindowEnd,
    topSpacer: replyTopSpacer,
    bottomSpacer: replyBottomSpacer,
    registerRow: registerReplyRow,
  } = useFeedWindow({
    keys: replyRowKeys,
    hostRef: replyStackRef,
    pinnedKey: focusPinKey,
    anchorQuery: THREAD_ANCHOR_QUERY,
    estimate: replyRowEstimates,
  });

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
  /* Structure and ACL arrive after the sheet paints. Until then a signed-in
     reply still opens the dock; a resolved denial hides it. */
  const postAccessReady = Boolean(guildStructure) && viewerAccessResolved;

  const performSubmit = async (
    target: PostRow,
    mode: ComposerMode,
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
    mode: ComposerMode,
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
    scheduleReconcile();
  };

  const openComposerModal = (mode: ComposerMode) => (target: PostRow) => {
    setModalMode(mode);
    setModalError(null);
    setModalTarget(target);
  };

  const submitFromModal = async (payload: ComposerSubmit) => {
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
        if (modalMode === 'quote') {
          dispatchPersonalQuoteConfirmed(target);
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
    if (accountId && postAccessReady && !canPostInChannel(channel)) return;
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

  const hrefForPost = (target: PostRow) =>
    guildPostPath(target.groupId ?? groupId, target.accountId, target.postId);

  const root = conversation.root;
  const writeTarget = dockTarget ?? root;
  const nestedDockReply = Boolean(
    root && writeTarget && postKey(writeTarget) !== postKey(root)
  );
  const writeName = writeTarget
    ? writeDockReplySpokenName(
        writeTarget.accountId,
        postAuthorProfiles[writeTarget.accountId]?.displayName
      )
    : '';
  const threadDraftKey = root
    ? writeDockDraftKey('post', postKey(root))
    : undefined;
  const writePreview =
    nestedDockReply && writeTarget
      ? writeDockReplyPreview(writeTarget.value)
      : '';
  const writeAbove =
    nestedDockReply && writeName ? (
      <OsWriteDockReplyChip
        label={writeName}
        preview={writePreview || null}
        onCancel={() => setDockTarget(null)}
      />
    ) : null;
  useReplyWriteDock({
    target: writeTarget,
    enabled:
      replyDockEnabled &&
      Boolean(root) &&
      (!accountId || !postAccessReady || canPostInThread),
    disabled: Boolean(modalTarget),
    placeholder: WRITE_DOCK_ADD_REPLY_PLACEHOLDER,
    above: writeAbove,
    onClearReply: nestedDockReply ? () => setDockTarget(null) : undefined,
    revision: writeTarget ? postKey(writeTarget) : '',
    draftKey: threadDraftKey,
    onExpand: writeTarget
      ? (payload) => expandReply(writeTarget, payload)
      : undefined,
    onConfirmed: (reply, target) => {
      if (conversation.root && postKey(target) === postKey(conversation.root)) {
        setLocalReplies((current) => [...current, reply]);
        threadFocus.requestFocus(reply);
      }
      scheduleReconcile();
      setDockTarget(null);
    },
  });

  const membershipHint = accountId
    ? (readGuildMembershipCache(accountId, groupId) ?? null)
    : null;
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
    confirmKind,
    actionPending: joinActionPending,
    dismissConfirm,
    confirmMembership,
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
    memberDriven,
    joinPending: effectiveJoinPending,
    joinCancelReady,
    isMember: effectiveIsMember,
    isBlacklisted: effectiveIsBlacklisted,
    needsStorage: needsCollaborativeStorage,
  });

  const needsJoinToReply =
    replyDockEnabled &&
    Boolean(accountId) &&
    viewerAccessResolved &&
    !effectiveIsMember &&
    !effectiveIsBlacklisted;
  const joinControl = needsJoinToReply ? (
    <GuildMembershipJoinButton
      className="guild-hero-membership guild-thread-nav-membership"
      label={membershipActionLabel}
      ready={membershipActionReady}
      active={effectiveIsMember}
      pending={joinActionPending}
      pendingLabel={guildMembershipJoinPendingLabel({
        accessGated,
        memberDriven,
        canceling: effectiveJoinPending,
        leaving: effectiveIsMember,
      })}
      disabled={
        (effectiveJoinPending && !joinCancelReady) ||
        (!viewerAccessResolved && Boolean(membershipHint))
      }
      onClick={handleMembershipClick}
    />
  ) : null;
  const membershipDrawer = (
    <GuildMembershipConfirmDrawer
      kind={confirmKind}
      guildName={guildDisplayName(guildName, groupId)}
      pending={joinActionPending}
      onConfirm={confirmMembership}
      onCancel={dismissConfirm}
    />
  );

  const rootContinued = threadRootContinued(
    conversation.root?.accountId,
    sortedReplyRows
  );

  const replyListRows = sortedReplyRows.map((row, index) => {
    if (row.kind === 'more') {
      const foldLabel =
        resolveThreadFoldLabel(row.hidden, {
          profiles: postAuthorProfiles,
          notableAccountIds: foldNotableIds,
        }) ??
        (row.hiddenCount === 1
          ? 'Show 1 more reply'
          : `Show ${row.hiddenCount} more replies`);
      const target = row.hidden[0];
      const foldKey = threadReplyRowKey(row);
      if (!target) return null;
      return (
        <div key={foldKey} ref={registerReplyRow(foldKey)}>
          <ThreadFoldLink
            href={guildPostPath(
              target.groupId ?? groupId,
              target.accountId,
              target.postId
            )}
            root={target}
            context={sheetContext}
          >
            {foldLabel}
          </ThreadFoldLink>
        </div>
      );
    }

    const next = sortedReplyRows[index + 1];
    const connectedToNext =
      next !== undefined &&
      (next.kind === 'more' ||
        (next.kind === 'post' && next.connectedToPrevious));
    const continuesRoot = rootContinued && index === 0;
    const itemClassName = [
      'post-thread-item',
      row.connectedToPrevious
        ? 'post-thread-item--up post-thread-item--cont'
        : continuesRoot
          ? 'post-thread-item--up'
          : '',
      connectedToNext ? 'post-thread-item--down' : '',
      threadFocus.isHighlighted(row.post)
        ? 'post-thread-item--focus-reply'
        : '',
    ]
      .filter(Boolean)
      .join(' ');

    const rowKey = threadReplyRowKey(row);
    return (
      <div key={rowKey} ref={registerReplyRow(rowKey)}>
        {index > 0 && !row.connectedToPrevious ? (
          <Divider variant="item" className="post-row-divider" />
        ) : null}
        <div
          className={itemClassName}
          data-thread-focus-reply={row.post.postId}
          data-thread-focus-key={postKey(row.post)}
        >
          <ThreadRail
            up={row.connectedToPrevious || continuesRoot}
            down={connectedToNext}
          />
          <ResolvedFeedPostCard
            post={row.post}
            quotedPosts={quotedPosts}
            postAuthorProfiles={postAuthorProfiles}
            hrefForPost={hrefForPost}
            videoSoundControl
            sheetContext={sheetContext}
            // Position under the root already says "reply".
            showRelationBadge={false}
            authorProfiles={postAuthorProfiles}
            className={
              row.connectedToPrevious ? 'post-card--chain-cont' : undefined
            }
            engagement={engagement}
            isReactionPending={isReactionPending}
            isSavePending={isSavePending}
            isSharePending={isSharePending}
            onToggleReaction={toggleReaction}
            onToggleSave={toggleSave}
            onAmplifyConfirmed={confirmAmplify}
            onReply={replyHandler}
            onExpandReply={expandReply}
            onQuote={quoteHandler}
            onRepost={repostHandler}
            onUndoRepost={undoRepostHandler}
            pollTallyFor={pollTallyFor}
            isPollVotePending={isPollVotePending}
            onPollVote={(post, optionIndex) => {
              void castVote(post, optionIndex);
            }}
          />
        </div>
      </div>
    );
  });

  const showReplyControl = repliesResolved && replyListRows.length > 0;
  const showQuoteControl = repliesResolved && Boolean(shareRow);

  useEffect(() => {
    const host = threadHostRef.current;
    if (!host) return;
    threadScrollRef.current =
      (host.closest('.os-app-screen-body') as HTMLElement | null) ?? null;
  }, [loadState, conversation.root?.postId]);

  useInfiniteScrollSentinel({
    scrollRootRef: threadScrollRef,
    sentinelRef: replyLoadMoreRef,
    enabled:
      hasMoreReplies && !loadingMore && !loadMoreError && loadState === 'ready',
    onIntersect: loadMore,
    rootMargin: '1400px 0px',
  });

  const threadBody = (
    <div ref={threadHostRef} className={GUILDS_PAGE_CLASS}>
      {loadState === 'missing' ? (
        <section className="guild-state-card">
          <p>We could not find this guild post in the indexed feed yet.</p>
          <OsEmptyAction onClick={() => void refresh()}>Retry</OsEmptyAction>
        </section>
      ) : null}

      {loadState === 'error' ? (
        <section className="guild-state-card is-error">
          <p>{error ?? GUILD_THREAD_LOAD_ERROR}</p>
          <OsEmptyAction onClick={() => void refresh()}>Retry</OsEmptyAction>
        </section>
      ) : null}

      {loadState === 'ready' && conversation.root ? (
        <section
          className={`guild-thread-column${rootContinued ? ' is-continued' : ''}`}
        >
          <div className="guild-thread-context">
            {hasAncestorRows ? (
              <div className="guild-thread-ancestors">
                {ancestorChain.map((ancestor, index) => (
                  <div
                    className={`guild-thread-ancestor post-thread-item post-thread-item--down${index > 0 ? ' post-thread-item--up' : ''}`}
                    key={postKey(ancestor)}
                  >
                    <ThreadRail up={index > 0} down />
                    <ResolvedFeedPostCard
                      post={ancestor}
                      quotedPosts={quotedPosts}
                      postAuthorProfiles={postAuthorProfiles}
                      hrefForPost={hrefForPost}
                      videoSoundControl
                      sheetContext={sheetContext}
                      returnToPost
                      // Top of chain keeps its context line if truncated.
                      showRelationBadge={index === 0}
                      authorProfiles={postAuthorProfiles}
                      engagement={engagement}
                      isReactionPending={isReactionPending}
                      isSavePending={isSavePending}
                      isSharePending={isSharePending}
                      onToggleReaction={toggleReaction}
                      onToggleSave={toggleSave}
                      onAmplifyConfirmed={confirmAmplify}
                      onReply={replyHandler}
                      onExpandReply={expandReply}
                      onQuote={quoteHandler}
                      onRepost={repostHandler}
                      onUndoRepost={undoRepostHandler}
                      pollTallyFor={pollTallyFor}
                      isPollVotePending={isPollVotePending}
                      onPollVote={(post, optionIndex) => {
                        void castVote(post, optionIndex);
                      }}
                    />
                  </div>
                ))}
              </div>
            ) : null}

            <div
              ref={openedPostRef}
              data-thread-opened-post={conversation.root.postId}
              className={[
                'guild-thread-root',
                hasParent || rootContinued ? 'post-thread-item' : '',
                hasParent ? 'post-thread-item--up' : '',
                rootContinued ? 'post-thread-item--down' : '',
              ]
                .filter(Boolean)
                .join(' ')}
            >
              <ThreadRail up={hasAncestorRows} down={rootContinued} />
              <ResolvedFeedPostCard
                post={conversation.root}
                quotedPosts={quotedPosts}
                postAuthorProfiles={postAuthorProfiles}
                hrefForPost={hrefForPost}
                mediaFocused
                videoSoundControl
                mediaUnmuted={mediaUnmuted}
                mediaResumeIndex={mediaResumeIndex}
                detailLayout
                rootRevisionLabel={threadRootRevisionLabel(rootRevision)}
                // Parent drawn above with a chain line already says "reply".
                showRelationBadge={!hasParent}
                authorProfiles={postAuthorProfiles}
                sheetContext={sheetContext}
                showGuildAttribution={showGuildLine}
                guildName={guildDisplayName(guildName, groupId)}
                showChannel={showRoom}
                channelTitleById={channelTitleById}
                engagement={engagement}
                isReactionPending={isReactionPending}
                isSavePending={isSavePending}
                isSharePending={isSharePending}
                onToggleReaction={toggleReaction}
                onToggleSave={toggleSave}
                onAmplifyConfirmed={confirmAmplify}
                onReply={replyHandler}
                onExpandReply={expandReply}
                onQuote={quoteHandler}
                onRepost={repostHandler}
                onUndoRepost={undoRepostHandler}
                pollTallyFor={pollTallyFor}
                isPollVotePending={isPollVotePending}
                onPollVote={(post, optionIndex) => {
                  void castVote(post, optionIndex);
                }}
              />
            </div>
          </div>

          <Divider variant="detail" />

          {conversation.root ? (
            <div
              className={`thread-controls-row${rootContinued ? ' is-continued' : ''}`}
            >
              {rootContinued ? <ThreadRail through /> : null}
              <span
                className={threadControlPresenceClass(showReplyControl)}
                aria-hidden={showReplyControl ? undefined : true}
              >
                <ThreadRepliesSortButton
                  sort={replySort}
                  onChange={setReplySort}
                />
              </span>
              <span
                className={threadControlPresenceClass(showQuoteControl)}
                aria-hidden={showQuoteControl ? undefined : true}
              >
                <ThreadViewQuotesRow
                  href={
                    shareRow
                      ? threadShareRowHref(
                          postQuotesPath(conversation.root),
                          shareRow
                        )
                      : postQuotesPath(conversation.root)
                  }
                  label={shareRow?.label ?? 'View quotes'}
                  count={shareRow?.count ?? 0}
                  rollSignal={rootEngagement?.shareRoll ?? 0}
                />
              </span>
            </div>
          ) : null}

          <div className="guild-connected-stack" ref={replyStackRef}>
            {!repliesResolved && replyListRows.length === 0 ? (
              <div aria-busy="true">
                <PostRowSkeleton rows={2} />
              </div>
            ) : null}
            {/* Reserve Join seat until ACL resolves — no post-appear shove. */}
            {replyListRows.length === 0 &&
            !shareRow &&
            (joinControl || !viewerAccessResolved) ? (
              <div
                className={`guild-thread-join-dock is-with-post${
                  joinControl ? '' : ' is-pending'
                }`}
                aria-hidden={joinControl ? undefined : true}
              >
                {joinControl}
              </div>
            ) : null}
            {replyWindowed && replyTopSpacer > 0 ? (
              <div
                style={{ height: replyTopSpacer }}
                aria-hidden="true"
                data-feed-window-spacer="top"
              />
            ) : null}
            {replyListRows.length > 0 ? (
              replyListRows.slice(replyWindowStart, replyWindowEnd)
            ) : repliesResolved && emptyTailReady && !shareRow ? (
              <ThreadDiscoverPeek
                author={author}
                excludePostId={postId}
                armed={repliesResolved}
                authorProfiles={postAuthorProfiles}
                onReply={replyHandler}
                onExpandReply={expandReply}
                onQuote={quoteHandler}
                onRepost={repostHandler}
                onUndoRepost={undoRepostHandler}
                onAmplifyConfirmed={confirmAmplify}
              />
            ) : null}
            {replyWindowed && replyBottomSpacer > 0 ? (
              <div
                style={{ height: replyBottomSpacer }}
                aria-hidden="true"
                data-feed-window-spacer="bottom"
              />
            ) : null}

            <GuildThreadLoadMoreFooter
              hasMore={hasMoreReplies}
              loadingMore={loadingMore}
              loadMoreError={loadMoreError}
              onLoadMore={loadMore}
              sentinelRef={replyLoadMoreRef}
            />
          </div>
        </section>
      ) : null}
      {joinControl && (replyListRows.length > 0 || shareRow) ? (
        <div className="guild-thread-join-dock">{joinControl}</div>
      ) : null}
    </div>
  );

  const threadChrome = (
    <>
      {modalTarget ? (
        <ComposerSheet
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
          {...(ownerZ != null
            ? { zIndex: postLayerOverlayZ(ownerZ).composer }
            : {})}
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
      {membershipDrawer}
    </>
  );

  if (embedded) {
    return (
      <>
        {threadBody}
        {threadChrome}
      </>
    );
  }

  return (
    <OsAppScreen
      title="Post"
      glassChrome
      compactChrome
      backFallbackHref={guildPath(groupId)}
      leading={<OsHeaderBack fallbackHref={guildPath(groupId)} />}
    >
      <OsRouteSettle
        ready={permalinkReady}
        skeleton={<PostThreadPageSkeleton />}
      >
        {threadBody}
      </OsRouteSettle>
      {threadChrome}
    </OsAppScreen>
  );
}
