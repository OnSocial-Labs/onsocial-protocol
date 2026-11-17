'use client';

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import type { PostRow, ThreadNode } from '@onsocial/sdk';
import { Divider } from '@onsocial/ui';
import { OsAppScreen } from '@/components/app/os-app-screen';
import { OsHeaderBack } from '@/components/app/os-header-back';
import { OsRouteSettle } from '@/components/app/os-route-settle';
import { useAppTransactionFeedback } from '@/contexts/app-transaction-feedback-context';
import { useAppWallet } from '@/contexts/app-wallet-context';
import {
  useFocusWriteDock,
  type WriteDockSubmit,
} from '@/contexts/compose-launcher-context';
import { OsWriteDockReplyChip } from '@/components/os/os-write-dock';
import { useReplyWriteDock } from '@/hooks/use-reply-write-dock';
import {
  writeDockDraftKey,
  WRITE_DOCK_ADD_REPLY_PLACEHOLDER,
  writeDockReplyPreview,
  writeDockReplySpokenName,
} from '@/lib/os-write-dock';
import { GUILDS_PAGE_CLASS } from '@/lib/os-chrome-page';
import { OsEmptyAction } from '@/lib/os-empty-action';
import { OsLoadMore } from '@/lib/os-load-more';
import {
  clearWriteDockDraft,
  writeDockDraftFromComposer,
  writeDockExpandSeed,
  writeWriteDockDraft,
} from '@/lib/os-write-dock-draft';
import {
  ComposerSheet,
  type ComposerMode,
  type ComposerSubmit,
} from '@/features/guilds/guild-composer-sheet';
import { postKey } from '@/features/home/post-card';
import { ResolvedFeedPostCard } from '@/features/home/resolved-feed-post-card';
import { PostThreadPageSkeleton } from '@/features/home/post-skeleton';
import { ThreadRail } from '@/features/home/thread-rail';
import { ThreadDiscoverPeek } from '@/features/home/thread-discover-peek';
import { ThreadRepliesSortButton } from '@/features/home/thread-replies-sort';
import { ThreadViewQuotesRow } from '@/features/home/thread-view-quotes-row';
import {
  submitPersonalPost,
  submitPersonalRepost,
  submitPersonalUnrepost,
} from '@/features/home/submit-personal-post';
import { ThreadFoldLink } from '@/features/home/thread-fold-button';
import { dispatchPersonalQuoteConfirmed } from '@/features/scarces/drop-compose-host';
import {
  scarceEmbedsForOpenRoot,
  seedScarceEmbedsFromSsr,
} from '@/features/scarces/scarce-embed-ledger';
import { useAppOnSocialClient } from '@/hooks/use-app-onsocial-client';
import {
  seedPostAuthorProfilesFromFeed,
  usePostAuthorProfiles,
} from '@/hooks/use-post-author-profiles';
import {
  usePostEngagement,
} from '@/hooks/use-post-engagement';
import { usePollVotes } from '@/hooks/use-poll-votes';
import { useThreadLandAppear } from '@/hooks/use-land-opened-post';
import { useThreadFocusReply } from '@/hooks/use-thread-focus-reply';
import {
  asAncestorChainState,
  useAncestorChain,
  useQuotedPosts,
} from '@/hooks/use-quoted-posts';
import {
  directRepliesToTree,
  enrichPaintedReplyTree,
  graftVisibleReplies,
  shouldPaintDirectReplies,
  startThreadFirstPage,
  visibleReplyPaths,
} from '@/lib/thread-first-page';
import { planThreadLoad } from '@/lib/thread-open';
import { collectRelationTargetAccountIds } from '@/lib/post-relation';
import { createReadOnlyOnSocialClient } from '@/lib/create-readonly-onsocial-client';
import { fetchIndexedPost, fetchPersonalPost } from '@/lib/fetch-personal-post';
import {
  THREAD_QUOTE_PAGE_SIZE,
  THREAD_REPLY_PAGE_SIZE,
  THREAD_REPLY_TREE_DEPTH,
  THREAD_REPLY_TREE_MAX_NODES,
  type PersonalPostPageData,
} from '@/lib/load-personal-post-page';
import {
  readThreadSession,
  writeThreadSession,
} from '@/lib/thread-session-cache';
import { APP_HOME_PATH } from '@/lib/app-routes';
import {
  appendThreadFocusReply,
  personalPostContentPath,
  personalPostQuotesPath,
  postThreadPath,
  THREAD_FOCUS_REPLY_QUERY,
} from '@/lib/post-routes';
import {
  resolveThreadShareRow,
  threadShareRowHref,
} from '@/lib/thread-share-row';
import { usePostLayerOwnerZ } from '@/features/home/post-layer-owner-z';
import { SHEET_Z, postLayerOverlayZ } from '@/lib/sheet-z';
import {
  sortThreadReplyRows,
  type ThreadReplySort,
} from '@/lib/thread-reply-sort';
import {
  buildReplyRows,
  flattenTreePosts,
  leafThreadNode,
  threadReplyRowKey,
  threadRootContinued,
  withoutIndexedPosts,
} from '@/lib/thread-display';
import { threadReplyRowEstimatePx } from '@/features/home/feed-block-estimate';
import { useFeedWindow } from '@/features/home/use-feed-window';
import { THREAD_ANCHOR_QUERY } from '@/features/home/home-feed-scroll-anchor';
import { resolveThreadFoldLabel } from '@/lib/thread-fold-label';
import { isWalletUserCancellation } from '@/lib/wallet-errors';
import { playPostFocusVideo } from '@/hooks/use-post-list-video';
import { holdScrollerAt } from '@/lib/write-dock-keyboard-hold';
import { readPostMediaUnmuteIndex } from '@/lib/post-media';

type LoadState = 'loading' | 'ready' | 'missing' | 'error';

const REPLY_PAGE_SIZE = THREAD_REPLY_PAGE_SIZE;
const QUOTE_PAGE_SIZE = THREAD_QUOTE_PAGE_SIZE;
const REPLY_TREE_DEPTH = THREAD_REPLY_TREE_DEPTH;
const REPLY_TREE_MAX_NODES = THREAD_REPLY_TREE_MAX_NODES;
const RECONCILE_DELAYS_MS = [2_000, 5_000];

/*
 * Reply reveal — one instant nudge when the answered post is under the
 * pill. The keyboard hold then keeps that gap. A smooth scroll during
 * the lift is the hop.
 */
const REPLY_REVEAL_MARGIN_PX = 12;

function replyRevealScrollable(node: HTMLElement): HTMLElement | null {
  let current = node.parentElement;
  while (current) {
    const style = getComputedStyle(current);
    if (
      /(auto|scroll)/.test(style.overflowY) &&
      current.scrollHeight > current.clientHeight
    ) {
      return current;
    }
    current = current.parentElement;
  }
  return null;
}

function scheduleReplyTargetReveal(post: Pick<PostRow, 'postId'>) {
  if (typeof window === 'undefined') return;
  const id = post.postId.trim();
  if (!id) return;
  const reveal = () => {
    const escaped = CSS.escape(id);
    const node = document.querySelector<HTMLElement>(
      `[data-thread-focus-reply="${escaped}"], [data-thread-opened-post="${escaped}"]`
    );
    const dock = document.querySelector<HTMLElement>(
      '.portfolio-summon-dock:has(.os-write-dock)'
    );
    if (!node || !dock) return;
    const overlap =
      node.getBoundingClientRect().bottom +
      REPLY_REVEAL_MARGIN_PX -
      dock.getBoundingClientRect().top;
    if (overlap <= 0) return;
    const scroller = replyRevealScrollable(node);
    if (scroller) holdScrollerAt(scroller, scroller.scrollTop + overlap);
    else window.scrollBy({ top: overlap, behavior: 'auto' });
  };
  window.requestAnimationFrame(reveal);
}

interface LivePersonalPostPanelProps {
  author: string;
  postId: string;
  initial?: PersonalPostPageData | null;
  /**
   * Media-face thread drawer — no OsAppScreen jacket. Same replies
   * and write dock as `/@account/posts/:id`.
   */
  embedded?: boolean;
  /** Hide root photo / video — the enlarge film already shows it. */
  hideRootMedia?: boolean;
  /**
   * Under-header pin. Off for media-band / hug embeds — those have no
   * `.os-app-screen-body` seat (land there scrolled the wrong surface).
   */
  landSeat?: boolean;
  /** False while the drawer is closing or no longer the screen in front. */
  replyDockEnabled?: boolean;
  /** Covered trail sheet — freeze land/scroll for identity back. */
  parked?: boolean;
  /** Sheet appear waits until the opened post is on screen. */
  onThreadPainted?: () => void;
}

interface PersonalConversation {
  root: PostRow | null;
  replies: PostRow[];
  quotes: PostRow[];
}

export function LivePersonalPostPanel({
  author,
  postId,
  initial = null,
  embedded = false,
  hideRootMedia = false,
  landSeat = true,
  replyDockEnabled = true,
  parked = false,
  onThreadPainted,
}: LivePersonalPostPanelProps) {
  seedScarceEmbedsFromSsr(initial?.scarceEmbeds);
  if (initial?.root) seedPostAuthorProfilesFromFeed([initial.root]);
  const { accountId, isConnected, connect } = useAppWallet();
  const { getClient } = useAppOnSocialClient();
  const { setTxResult, trackTransaction } = useAppTransactionFeedback();
  const router = useRouter();
  const searchParams = useSearchParams();
  const ownerZ = usePostLayerOwnerZ();
  const mediaUnmuted = searchParams.get('media') === 'unmute';
  const mediaResumeIndex = readPostMediaUnmuteIndex(searchParams);
  const rootPath = personalPostContentPath(author, postId);
  /*
   * Stale-while-revalidate seed: a thread opened earlier this session paints
   * its replies instantly from the session cache while `refresh` revalidates
   * in the background. Full SSR data (direct page load) is fresher and wins;
   * the tapped feed row always stays the root — it is what the user saw.
   */
  const [sessionSeed] = useState(() => {
    const cached =
      initial && initial.replyTree.length > 0
        ? null
        : readThreadSession(rootPath);
    if (!cached) return { data: initial, fromCache: false };
    return {
      fromCache: true,
      data: {
        root: initial?.root ?? cached.root,
        replies: cached.replies,
        quotes: cached.quotes,
        replyTree: cached.replyTree,
        hasMoreReplies: cached.hasMoreReplies,
        engagement: { ...cached.engagement, ...(initial?.engagement ?? {}) },
        scarceEmbeds: initial?.scarceEmbeds ?? {},
      } satisfies PersonalPostPageData,
    };
  });
  const seeded = sessionSeed.data;
  const [loadState, setLoadState] = useState<LoadState>(() =>
    seeded ? 'ready' : 'loading'
  );
  const [conversation, setConversation] = useState<PersonalConversation>(() =>
    seeded
      ? {
          root: seeded.root,
          replies: seeded.replies,
          quotes: seeded.quotes,
        }
      : { root: null, replies: [], quotes: [] }
  );
  const [replyTree, setReplyTree] = useState<ThreadNode[]>(
    () => seeded?.replyTree ?? []
  );
  /** First reply page ready — appear waits on this; graft/tree enrich after. */
  const [repliesResolved, setRepliesResolved] = useState(
    () =>
      sessionSeed.fromCache || Boolean(sessionSeed.data?.directRepliesResolved)
  );
  /**
   * Empty-tail gate for More from. Appear does not wait — but peek must not
   * mount until share counts are known, or View quotes arriving unmounts it
   * and the tail jumps.
   */
  const [shareTailReady, setShareTailReady] = useState(
    () => sessionSeed.fromCache
  );
  const firstPagePaintedRef = useRef(sessionSeed.fromCache);
  const hasMoreRepliesRef = useRef(Boolean(seeded?.hasMoreReplies));
  const [localReplies, setLocalReplies] = useState<PostRow[]>([]);
  const [localQuotes, setLocalQuotes] = useState<PostRow[]>([]);
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
  const [hasMoreReplies, setHasMoreReplies] = useState(
    () => seeded?.hasMoreReplies ?? false
  );
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const paginatedRef = useRef(false);
  const refreshRequestIdRef = useRef(0);
  const reconcileTimersRef = useRef<number[]>([]);
  const openedPostRef = useRef<HTMLDivElement>(null);

  const paintedKeyRef = useRef<string | null>(seeded ? rootPath : null);
  const treePosts = useMemo(() => flattenTreePosts(replyTree), [replyTree]);
  const replyRows = useMemo(() => {
    const rows = buildReplyRows(replyTree, conversation.root?.accountId);
    const lastPostRow = [...rows]
      .reverse()
      .find((row): row is Extract<(typeof rows)[number], { kind: 'post' }> => {
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
  const parentPath = conversation.root?.parentPath;
  const { ancestors: ancestorChain, ready: ancestorsReady } =
    asAncestorChainState(useAncestorChain(parentPath));
  const hasParent = Boolean(parentPath);
  const hasAncestorRows = ancestorChain.length > 0;
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
    initial: seeded?.engagement ?? null,
    onError: (message) => setTxResult({ type: 'error', msg: message }),
  });
  const engagementLatestRef = useRef(engagement);
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
  // Quotes fetch + root engagement both feed shareRow — wait for both before
  // More from so a late repost count cannot unmount the peek.
  const rootEngagementKey = conversation.root
    ? postKey(conversation.root)
    : null;
  const emptyTailReady =
    shareTailReady &&
    (rootEngagementKey == null ||
      Boolean(
        seeded?.engagement?.[rootEngagementKey] ||
          engagement[rootEngagementKey]
      ));
  const { landSettled } = useThreadLandAppear({
    openedPostRef,
    postId: conversation.root?.postId,
    hasParent,
    ancestorsReady,
    loadReady: loadState === 'ready',
    hasRoot: Boolean(conversation.root),
    tailReady: repliesResolved,
    pinKey: ancestorsReady
      ? ancestorChain.map((post) => post.postId).join('\n')
      : '',
    parked,
    landSeat,
    onThreadPainted,
  });
  const permalinkReady =
    loadState === 'missing' ||
    loadState === 'error' ||
    (loadState === 'ready' &&
      Boolean(conversation.root) &&
      landSettled &&
      repliesResolved);
  const sortedReplyRows = useMemo(
    () => sortThreadReplyRows(replyRows, replySort, engagement),
    [replyRows, replySort, engagement]
  );

  /*
   * Reply windowing (same core as the feed list): past the row threshold,
   * far rows collapse into spacers so a long thread stops mounting every
   * reply card forever. The scroll root is detected from the stack element
   * (app screen body full-page, sheet body in the drawer). While a deep-link
   * focus target is pending, its row is pinned mounted so the focus retry
   * loop can find it even before it would scroll into the window.
   */
  const replyRowKeys = useMemo(
    () => sortedReplyRows.map(threadReplyRowKey),
    [sortedReplyRows]
  );
  const replyRowEstimates = useMemo(
    () =>
      sortedReplyRows.map((row) =>
        threadReplyRowEstimatePx(row, quotedPosts)
      ),
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

  const refresh = useCallback(
    async (options: { background?: boolean } = {}) => {
      const requestId = ++refreshRequestIdRef.current;
      if (!options.background) {
        setLoadState('loading');
        setError(null);
      }

      try {
        const client = createReadOnlyOnSocialClient();
        const paintDirect = shouldPaintDirectReplies({
          fromCache: sessionSeed.fromCache,
          paginated: paginatedRef.current,
          directRepliesResolved: sessionSeed.data?.directRepliesResolved,
        });
        const firstPagePromise = paintDirect
          ? startThreadFirstPage(rootPath)
          : null;
        // First reply page gates appear; quote/tree soft-fill after.
        const rootPromise = fetchPersonalPost({ author, postId });
        const quotesPromise = client.query.threads.quotes(author, postId, {
          limit: QUOTE_PAGE_SIZE,
          order: 'desc',
        });
        const treePromise = client.query.threads.treeByPath(rootPath, {
          depth: REPLY_TREE_DEPTH,
          includeQuotes: false,
          replyLimit: REPLY_PAGE_SIZE,
          maxNodes: REPLY_TREE_MAX_NODES,
        });

        if (firstPagePromise) {
          try {
            const first = await firstPagePromise;
            if (refreshRequestIdRef.current !== requestId) return;
            if (!paginatedRef.current) {
              const pageTree = directRepliesToTree(first.replies);
              setConversation((current) => ({
                ...current,
                replies: first.replies,
              }));
              setReplyTree(pageTree);
              setHasMoreReplies(first.hasMore);
              hasMoreRepliesRef.current = first.hasMore;
              firstPagePaintedRef.current = true;
              setRepliesResolved(true);
              // Graft soft-fills nested lines after appear — don't block hero.
              const visiblePaths = visibleReplyPaths(first.replies);
              if (visiblePaths.length > 0) {
                void client.query.threads
                  .visibleReplies(visiblePaths)
                  .then((children) => {
                    if (refreshRequestIdRef.current !== requestId) return;
                    if (paginatedRef.current) return;
                    setReplyTree((current) =>
                      graftVisibleReplies(current, children)
                    );
                  })
                  .catch(() => {
                    // Tree walk below still fills the line.
                  });
              }
              const seedRoot = seeded?.root ?? null;
              if (seedRoot) {
                writeThreadSession(rootPath, {
                  root: seedRoot,
                  replies: first.replies,
                  quotes: seeded?.quotes ?? [],
                  replyTree: pageTree,
                  hasMoreReplies: first.hasMore,
                  engagement: engagementLatestRef.current,
                  scarceEmbeds: scarceEmbedsForOpenRoot(seedRoot),
                });
              }
            }
          } catch {
            // Root + tree walk below still resolve the thread.
          }
        }

        let root: PostRow | null;
        try {
          root = await rootPromise;
        } catch (cause) {
          throw cause;
        }
        if (refreshRequestIdRef.current !== requestId) return;

        if (!root && !options.background) {
          const indexed = await fetchIndexedPost({ author, postId });
          if (indexed?.groupId) {
            const href = postThreadPath(indexed);
            const reply = searchParams.get(THREAD_FOCUS_REPLY_QUERY);
            router.replace(reply ? appendThreadFocusReply(href, reply) : href);
            return;
          }
        }
        // Soft refresh must not blank a painted SSR thread on a null miss.
        if (options.background && !root) {
          return;
        }

        setConversation((current) => ({
          ...current,
          root,
        }));
        setRepliesResolved(true);
        if (!options.background) {
          setLoadState(root ? 'ready' : 'missing');
        }

        const [quotesResult, treeResult] = await Promise.allSettled([
          quotesPromise,
          treePromise,
        ]);
        if (refreshRequestIdRef.current !== requestId) return;

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

        if (!options.background || !paginatedRef.current) {
          const keepFirstPage =
            treeOk && firstPagePaintedRef.current && !paginatedRef.current;
          setConversation((current) => ({
            root: current.root ?? root,
            replies: keepFirstPage
              ? current.replies
              : treeOk
                ? fetchedTree.map((node) => node.post)
                : current.replies,
            quotes: fetchedQuotes,
          }));
          if (treeOk) {
            if (keepFirstPage) {
              // Enrich in place — never replace the painted first page order.
              setReplyTree((current) => {
                const next = enrichPaintedReplyTree(current, fetchedTree);
                if (root) {
                  writeThreadSession(rootPath, {
                    root,
                    replies: next.map((node) => node.post),
                    quotes: fetchedQuotes,
                    replyTree: next,
                    hasMoreReplies: hasMoreRepliesRef.current,
                    engagement: engagementLatestRef.current,
                    scarceEmbeds: scarceEmbedsForOpenRoot(root),
                  });
                }
                return next;
              });
            } else {
              setReplyTree(fetchedTree);
              const more = fetchedTree.length >= REPLY_PAGE_SIZE;
              setHasMoreReplies(more);
              hasMoreRepliesRef.current = more;
              if (root) {
                writeThreadSession(rootPath, {
                  root,
                  replies: fetchedTree.map((node) => node.post),
                  quotes: fetchedQuotes,
                  replyTree: fetchedTree,
                  hasMoreReplies: more,
                  engagement: engagementLatestRef.current,
                  scarceEmbeds: scarceEmbedsForOpenRoot(root),
                });
              }
            }
          }
        }
        setShareTailReady(true);
      } catch (cause) {
        if (options.background) return;
        if (refreshRequestIdRef.current !== requestId) return;
        setRepliesResolved(true);
        setShareTailReady(true);
        setLoadState('error');
        setError(
          cause instanceof Error ? cause.message : 'Could not load post thread.'
        );
      }
    },
    [
      author,
      postId,
      rootPath,
      router,
      searchParams,
      seeded,
      sessionSeed.data?.directRepliesResolved,
      sessionSeed.fromCache,
    ]
  );

  useEffect(() => {
    let cancelled = false;
    const key = rootPath;
    // One load per setup. A second effect pass must not blank a painted card.
    // The read is public, so it does not wait for the wallet.
    queueMicrotask(() => {
      if (cancelled) return;
      const plan = planThreadLoad(paintedKeyRef.current, key);
      paintedKeyRef.current = plan.paintedKey;
      void refresh({ background: plan.background });
    });
    return () => {
      cancelled = true;
    };
  }, [refresh, rootPath]);

  useEffect(() => {
    const timers = reconcileTimersRef.current;
    return () => {
      for (const timer of timers) window.clearTimeout(timer);
    };
  }, []);

  useEffect(() => {
    if (embedded || hideRootMedia || !mediaUnmuted) return;
    playPostFocusVideo(mediaResumeIndex);
  }, [
    embedded,
    hideRootMedia,
    mediaUnmuted,
    mediaResumeIndex,
    conversation.root?.postId,
  ]);

  const scheduleReconcile = useCallback(() => {
    for (const delay of RECONCILE_DELAYS_MS) {
      reconcileTimersRef.current.push(
        window.setTimeout(() => {
          void refresh({ background: true });
        }, delay)
      );
    }
  }, [refresh]);

  const loadMoreReplies = useCallback(async () => {
    if (loadingMore) return;
    setLoadingMore(true);
    try {
      const client = createReadOnlyOnSocialClient();
      const page = await client.query.threads.repliesByPath(rootPath, {
        limit: REPLY_PAGE_SIZE,
        offset: conversation.replies.length,
      });
      paginatedRef.current = true;
      /* Offset paging with no cursor: replies landing between fetches shift
       * the window, so drop rows we already have (same merge rule as the
       * main feed's mergeFeedPosts) instead of painting duplicates. */
      setConversation((current) => {
        const seen = new Set(current.replies.map(postKey));
        const fresh = page.filter((post) => {
          const key = postKey(post);
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });
        return { ...current, replies: [...current.replies, ...fresh] };
      });
      setReplyTree((current) => {
        const seen = new Set(current.map((node) => postKey(node.post)));
        const fresh = page.filter((post) => {
          const key = postKey(post);
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });
        return [
          ...current,
          ...fresh.map((post) =>
            leafThreadNode(
              post,
              personalPostContentPath(post.accountId, post.postId)
            )
          ),
        ];
      });
      setHasMoreReplies(page.length >= REPLY_PAGE_SIZE);
    } catch {
      // Keep the current list; the button stays available to retry.
    } finally {
      setLoadingMore(false);
    }
  }, [conversation.replies.length, loadingMore, rootPath]);

  const canPostInThread = Boolean(isConnected && accountId);

  const insertConfirmedRootChild = (
    mode: ComposerMode,
    optimisticPost: PostRow
  ) => {
    if (mode === 'quote') {
      setLocalQuotes((current) => [...current, optimisticPost]);
    } else {
      setLocalReplies((current) => [...current, optimisticPost]);
    }
    if (mode === 'reply') {
      threadFocus.requestFocus(optimisticPost);
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
    if (!target || modalPending || (!text && !files.length)) return;

    if (!isConnected || !accountId) {
      await connect();
      return;
    }

    setModalError(null);
    setModalPending(true);
    try {
      const { client } = await getClient();
      const result = await submitPersonalPost({
        client,
        accountId,
        mode: modalMode,
        target,
        payload,
        trackTransaction,
      });
      if (result.confirmed && result.optimisticPost) {
        const targetsRoot =
          conversation.root && postKey(target) === postKey(conversation.root);
        if (targetsRoot) {
          insertConfirmedRootChild(modalMode, result.optimisticPost);
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
    setDockTarget(post);
    focusWriteDock();
    scheduleReplyTargetReveal(post);
  };
  const quoteHandler = canPostInThread
    ? (post: PostRow) => {
        setModalSeed({ text: '', files: [] });
        openComposerModal('quote')(post);
      }
    : undefined;
  const expandReply = (post: PostRow, payload: WriteDockSubmit) => {
    const draftKey = threadDraftKey ?? writeDockDraftKey('post', postKey(post));
    const seed = writeDockExpandSeed(draftKey, payload);
    setModalSeed({ text: seed.initialText, files: seed.initialFiles });
    openComposerModal('reply')(post);
  };
  const repostHandler = canPostInThread
    ? (post: PostRow) => {
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
              // Reposts are not quote-tab rows; wait for indexer reconcile.
              scheduleReconcile();
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

  const hrefForPost = (target: PostRow) => postThreadPath(target);

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
  const nestMenuZ = embedded ? SHEET_Z.confirm : undefined;
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
    enabled: Boolean(root) && replyDockEnabled,
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
        insertConfirmedRootChild('reply', reply);
      } else {
        scheduleReconcile();
      }
      setDockTarget(null);
    },
  });

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
          <ThreadFoldLink href={postThreadPath(target)} root={target}>
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
            menuZIndex={nestMenuZ}
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

  const thread = (
    <div
      className={hideRootMedia ? 'feed-media-thread-embed' : GUILDS_PAGE_CLASS}
    >
      {loadState === 'missing' ? (
        <section className="guild-state-card">
          <p>We could not find this post in the indexed feed yet.</p>
          <OsEmptyAction onClick={() => void refresh()}>Retry</OsEmptyAction>
        </section>
      ) : null}

      {loadState === 'error' ? (
        <section className="guild-state-card is-error">
          <p>{error ?? 'Could not load post thread.'}</p>
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
                    data-thread-focus-reply={ancestor.postId}
                    data-thread-focus-key={postKey(ancestor)}
                  >
                <ThreadRail up={index > 0} down />
                <ResolvedFeedPostCard
                  post={ancestor}
                  quotedPosts={quotedPosts}
                  postAuthorProfiles={postAuthorProfiles}
                  hrefForPost={hrefForPost}
                  videoSoundControl
                  returnToPost
                  menuZIndex={nestMenuZ}
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
                hideMedia={hideRootMedia}
                menuZIndex={nestMenuZ}
                mediaUnmuted={mediaUnmuted}
                mediaResumeIndex={mediaResumeIndex}
                detailLayout
                showRelationBadge={!hasParent}
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
          </div>

          <Divider variant="detail" />

          <div
            className={`thread-controls-row${
              replyListRows.length > 0 || shareRow ? '' : ' is-idle'
            }${rootContinued ? ' is-continued' : ''}`}
          >
            {rootContinued ? <ThreadRail through /> : null}
            {replyListRows.length > 0 ? (
              <ThreadRepliesSortButton
                sort={replySort}
                onChange={setReplySort}
              />
            ) : (
              <span className="thread-controls-spacer" aria-hidden />
            )}
            <ThreadViewQuotesRow
              href={
                shareRow
                  ? threadShareRowHref(
                      personalPostQuotesPath(author, postId),
                      shareRow
                    )
                  : personalPostQuotesPath(author, postId)
              }
              label={shareRow?.label ?? 'View quotes'}
              count={shareRow?.count ?? 0}
              rollSignal={rootEngagement?.shareRoll ?? 0}
            />
          </div>

          <div className="guild-connected-stack" ref={replyStackRef}>
            {replyWindowed && replyTopSpacer > 0 ? (
              <div
                style={{ height: replyTopSpacer }}
                aria-hidden="true"
                data-feed-window-spacer="top"
              />
            ) : null}
            {replyListRows.length > 0 ? (
              replyListRows.slice(replyWindowStart, replyWindowEnd)
            ) : emptyTailReady && !shareRow ? (
              <ThreadDiscoverPeek
                author={author}
                excludePostId={postId}
                armed={repliesResolved}
                authorProfiles={postAuthorProfiles}
                menuZIndex={nestMenuZ}
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

            {hasMoreReplies ? (
              <OsLoadMore
                onClick={() => void loadMoreReplies()}
                pending={loadingMore}
                disabled={loadingMore}
              >
                {loadingMore ? 'Loading…' : 'Show more replies'}
              </OsLoadMore>
            ) : null}
          </div>
        </section>
      ) : null}
    </div>
  );

  const composer = modalTarget ? (
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
      zIndex={
        ownerZ != null
          ? postLayerOverlayZ(ownerZ).composer
          : embedded
            ? SHEET_Z.confirm
            : undefined
      }
      onClose={(draft) => {
        if (modalPending) return;
        if (modalMode === 'reply' && draft) {
          const persistKey =
            threadDraftKey &&
            writeTarget &&
            postKey(modalTarget) === postKey(writeTarget)
              ? threadDraftKey
              : writeDockDraftKey('post', postKey(modalTarget));
          writeWriteDockDraft(persistKey, writeDockDraftFromComposer(draft));
        }
        setModalTarget(null);
        setModalSeed({ text: '', files: [] });
        if (modalMode === 'reply' && draft?.text.trim()) {
          focusWriteDock();
        }
      }}
      onSubmit={(payload) => void submitFromModal(payload)}
    />
  ) : null;

  if (embedded) {
    return (
      <>
        {thread}
        {composer}
      </>
    );
  }

  return (
    <OsAppScreen
      title="Post"
      glassChrome
      compactChrome
      backFallbackHref={APP_HOME_PATH}
      leading={<OsHeaderBack fallbackHref={APP_HOME_PATH} />}
    >
      <OsRouteSettle
        ready={permalinkReady}
        skeleton={<PostThreadPageSkeleton />}
      >
        {thread}
      </OsRouteSettle>
      {composer}
    </OsAppScreen>
  );
}
