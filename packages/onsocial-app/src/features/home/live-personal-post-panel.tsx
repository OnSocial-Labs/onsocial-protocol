'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import type { PostRow, ThreadNode } from '@onsocial/sdk';
import { Divider } from '@onsocial/ui';
import { OsAppScreen } from '@/components/app/os-app-screen';
import { useAppTransactionFeedback } from '@/contexts/app-transaction-feedback-context';
import { useAppWallet } from '@/contexts/app-wallet-context';
import { useRegisterComposeAction } from '@/contexts/compose-launcher-context';
import {
  ComposerSheet,
  type ComposerMode,
  type ComposerSubmit,
} from '@/features/guilds/guild-composer-sheet';
import { PostCard, PostRowSkeleton, postKey } from '@/features/home/post-card';
import { submitPersonalPost } from '@/features/home/submit-personal-post';
import { useAppOnSocialClient } from '@/hooks/use-app-onsocial-client';
import { usePostAuthorProfiles } from '@/hooks/use-post-author-profiles';
import { usePostEngagement } from '@/hooks/use-post-engagement';
import { usePollVotes } from '@/hooks/use-poll-votes';
import { useAncestorChain, useQuotedPosts } from '@/hooks/use-quoted-posts';
import { createReadOnlyOnSocialClient } from '@/lib/create-readonly-onsocial-client';
import { fetchPersonalPost } from '@/lib/fetch-personal-post';
import { portfolioPath } from '@/lib/overlay-routes';
import {
  personalPostContentPath,
  postThreadPath,
} from '@/lib/post-routes';
import {
  buildReplyRows,
  flattenTreePosts,
  leafThreadNode,
  withoutIndexedPosts,
} from '@/lib/thread-display';
import { isWalletUserCancellation } from '@/lib/wallet-errors';
import { playPostFocusVideo } from '@/hooks/use-post-list-video';
import { readPostMediaUnmuteIndex } from '@/lib/post-media';

type LoadState = 'loading' | 'ready' | 'missing' | 'error';
type ThreadTab = 'replies' | 'quotes';

const REPLY_PAGE_SIZE = 50;
const QUOTE_PAGE_SIZE = 12;
const REPLY_TREE_DEPTH = 6;
const REPLY_TREE_MAX_NODES = 300;
const RECONCILE_DELAYS_MS = [2_000, 5_000];

interface LivePersonalPostPanelProps {
  author: string;
  postId: string;
}

interface PersonalConversation {
  root: PostRow | null;
  replies: PostRow[];
  quotes: PostRow[];
}

export function LivePersonalPostPanel({
  author,
  postId,
}: LivePersonalPostPanelProps) {
  const {
    accountId,
    isConnected,
    isLoading: walletLoading,
    connect,
  } = useAppWallet();
  const { getClient } = useAppOnSocialClient();
  const { setTxResult, trackTransaction } = useAppTransactionFeedback();
  const searchParams = useSearchParams();
  const mediaUnmuted = searchParams.get('media') === 'unmute';
  const mediaResumeIndex = readPostMediaUnmuteIndex(searchParams);
  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [conversation, setConversation] = useState<PersonalConversation>({
    root: null,
    replies: [],
    quotes: [],
  });
  const [replyTree, setReplyTree] = useState<ThreadNode[]>([]);
  const [localReplies, setLocalReplies] = useState<PostRow[]>([]);
  const [localQuotes, setLocalQuotes] = useState<PostRow[]>([]);
  const [modalTarget, setModalTarget] = useState<PostRow | null>(null);
  const [modalMode, setModalMode] = useState<ComposerMode>('reply');
  const [modalPending, setModalPending] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);
  const [activeThreadTab, setActiveThreadTab] = useState<ThreadTab>('replies');
  const [expandedBranches, setExpandedBranches] = useState<Set<string>>(
    () => new Set()
  );
  const [hasMoreReplies, setHasMoreReplies] = useState(false);
  const [hasMoreQuotes, setHasMoreQuotes] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const paginatedRef = useRef(false);
  const reconcileTimersRef = useRef<number[]>([]);

  const rootPath = personalPostContentPath(author, postId);
  const treePosts = useMemo(() => flattenTreePosts(replyTree), [replyTree]);
  const replyRows = useMemo(() => {
    const rows = buildReplyRows(
      replyTree,
      conversation.root?.accountId,
      expandedBranches
    );
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
  }, [replyTree, conversation.root, expandedBranches, localReplies, treePosts]);
  const replyCount = useMemo(
    () =>
      treePosts.length + withoutIndexedPosts(localReplies, treePosts).length,
    [treePosts, localReplies]
  );
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
  const ancestorChain = useAncestorChain(conversation.root?.parentPath);
  const hasParent = ancestorChain.length > 0;
  const quotedPostSources = useMemo(
    () => [...threadPosts, ...ancestorChain],
    [threadPosts, ancestorChain]
  );
  const quotedPosts = useQuotedPosts(quotedPostSources);
  const postAuthorIds = useMemo(
    () => [
      ...threadPosts.map((post) => post.accountId),
      ...Object.values(quotedPosts).map((post) => post.accountId),
      ...ancestorChain.map((post) => post.accountId),
    ],
    [threadPosts, quotedPosts, ancestorChain]
  );
  const postAuthorProfiles = usePostAuthorProfiles(postAuthorIds);
  const { engagement, toggleReaction, isReactionPending } = usePostEngagement(
    threadPosts,
    {
      onError: (message) => setTxResult({ type: 'error', msg: message }),
    }
  );
  const { pollTallyFor, castVote, isPollVotePending } = usePollVotes(
    threadPosts,
    {
      onError: (message) => setTxResult({ type: 'error', msg: message }),
    }
  );

  const refresh = useCallback(
    async (options: { background?: boolean } = {}) => {
      if (!options.background) {
        setLoadState('loading');
        setError(null);
      }

      try {
        const client = createReadOnlyOnSocialClient();
        const [rootResult, quotesResult, treeResult] = await Promise.allSettled([
          fetchPersonalPost({ author, postId }),
          client.query.threads.quotes(author, postId, {
            limit: QUOTE_PAGE_SIZE,
            order: 'desc',
          }),
          client.query.threads.treeByPath(rootPath, {
            depth: REPLY_TREE_DEPTH,
            includeQuotes: false,
            replyLimit: REPLY_PAGE_SIZE,
            maxNodes: REPLY_TREE_MAX_NODES,
          }),
        ]);

        if (rootResult.status === 'rejected') {
          throw rootResult.reason;
        }

        const root = rootResult.value;
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

        if (!options.background || !paginatedRef.current) {
          setConversation({
            root,
            replies: fetchedTree.map((node) => node.post),
            quotes: fetchedQuotes,
          });
          setReplyTree(fetchedTree);
          setHasMoreReplies(fetchedTree.length >= REPLY_PAGE_SIZE);
          setHasMoreQuotes(fetchedQuotes.length >= QUOTE_PAGE_SIZE);
        }

        if (!options.background) {
          setLoadState(root ? 'ready' : 'missing');
        }
      } catch (cause) {
        if (options.background) return;
        setLoadState('error');
        setError(
          cause instanceof Error
            ? cause.message
            : 'Could not load post thread.'
        );
      }
    },
    [author, postId, rootPath]
  );

  useEffect(() => {
    if (walletLoading) return;
    void refresh();
  }, [refresh, walletLoading]);

  useEffect(() => {
    const timers = reconcileTimersRef.current;
    return () => {
      for (const timer of timers) window.clearTimeout(timer);
    };
  }, []);

  useEffect(() => {
    if (!mediaUnmuted) return;
    playPostFocusVideo(mediaResumeIndex);
  }, [mediaUnmuted, mediaResumeIndex, conversation.root?.postId]);

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
    async (tab: ThreadTab) => {
      if (loadingMore) return;
      setLoadingMore(true);
      try {
        const client = createReadOnlyOnSocialClient();
        if (tab === 'replies') {
          const page = await client.query.threads.repliesByPath(rootPath, {
            limit: REPLY_PAGE_SIZE,
            offset: conversation.replies.length,
          });
          paginatedRef.current = true;
          setConversation((current) => ({
            ...current,
            replies: [...current.replies, ...page],
          }));
          setReplyTree((current) => [
            ...current,
            ...page.map((post) =>
              leafThreadNode(
                post,
                personalPostContentPath(post.accountId, post.postId)
              )
            ),
          ]);
          setHasMoreReplies(page.length >= REPLY_PAGE_SIZE);
        } else {
          const page = await client.query.threads.quotesByPath(rootPath, {
            limit: QUOTE_PAGE_SIZE,
            offset: conversation.quotes.length,
            order: 'desc',
          });
          paginatedRef.current = true;
          setConversation((current) => ({
            ...current,
            quotes: [...current.quotes, ...page],
          }));
          setHasMoreQuotes(page.length >= QUOTE_PAGE_SIZE);
        }
      } catch {
        // Keep the current list; the button stays available to retry.
      } finally {
        setLoadingMore(false);
      }
    },
    [conversation.quotes.length, conversation.replies.length, loadingMore, rootPath]
  );

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
    setActiveThreadTab(mode === 'quote' ? 'quotes' : 'replies');
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
        setModalTarget(null);
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

  const replyHandler = canPostInThread
    ? (post: PostRow) => openComposerModal('reply')(post)
    : undefined;
  const quoteHandler = canPostInThread
    ? (post: PostRow) => openComposerModal('quote')(post)
    : undefined;

  const quotedHrefFor = (quoted: PostRow | undefined) =>
    quoted ? postThreadPath(quoted) : undefined;

  const root = conversation.root;
  const composeReplyToRoot = useCallback(() => {
    if (!root) return;
    setModalMode('reply');
    setModalError(null);
    setModalTarget(root);
  }, [root]);
  useRegisterComposeAction(canPostInThread && root ? composeReplyToRoot : null);

  return (
    <OsAppScreen
      title="Post"
      backFallbackHref={portfolioPath(author)}
    >
      <div className="guilds-page">
        {loadState === 'loading' ? <PostRowSkeleton rows={4} /> : null}

        {loadState === 'missing' ? (
          <section className="guild-state-card">
            <p>We could not find this post in the indexed feed yet.</p>
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
            <p>{error ?? 'Could not load post thread.'}</p>
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
                    actionHref={postThreadPath(ancestor)}
                    showRelationBadge={index === 0}
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
                    onReply={replyHandler}
                    onQuote={quoteHandler}
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
                  showRelationBadge={!hasParent}
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
                  engagement={engagement[postKey(conversation.root)]}
                  reactionPending={isReactionPending(conversation.root)}
                  onToggleReaction={toggleReaction}
                  onReply={replyHandler}
                  onQuote={quoteHandler}
                  pollTally={pollTallyFor(conversation.root)}
                  pollVotePending={isPollVotePending(conversation.root)}
                  onPollVote={(post, optionIndex) => {
                    void castVote(post, optionIndex);
                  }}
                />
              </div>
            </div>

            <Divider variant="detail" />

            {canPostInThread ? (
              <button
                type="button"
                className="guild-reply-prompt"
                onClick={() =>
                  conversation.root
                    ? openComposerModal('reply')(conversation.root)
                    : undefined
                }
              >
                Add a reply…
              </button>
            ) : (
              <div className="guild-state-card">
                Connect your wallet to reply. Thread history stays public.
              </div>
            )}

            <Divider variant="detail" />

            <div
              className="guild-thread-tabs"
              role="tablist"
              aria-label="Discussion content"
            >
              <button
                type="button"
                role="tab"
                id="personal-thread-tab-replies"
                aria-controls="personal-thread-panel"
                aria-selected={activeThreadTab === 'replies'}
                className={
                  activeThreadTab === 'replies' ? 'is-active' : undefined
                }
                onClick={() => setActiveThreadTab('replies')}
              >
                Replies
                <span className="guild-thread-tab-count">{replyCount}</span>
              </button>
              <button
                type="button"
                role="tab"
                id="personal-thread-tab-quotes"
                aria-controls="personal-thread-panel"
                aria-selected={activeThreadTab === 'quotes'}
                className={
                  activeThreadTab === 'quotes' ? 'is-active' : undefined
                }
                onClick={() => setActiveThreadTab('quotes')}
              >
                Quotes
                <span className="guild-thread-tab-count">{quotes.length}</span>
              </button>
            </div>

            <div
              id="personal-thread-panel"
              className="guild-connected-stack"
              role="tabpanel"
              aria-labelledby={
                activeThreadTab === 'replies'
                  ? 'personal-thread-tab-replies'
                  : 'personal-thread-tab-quotes'
              }
            >
              {activeThreadTab === 'replies' ? (
                replyRows.length > 0 ? (
                  replyRows.map((row, index) => {
                    if (row.kind === 'more') {
                      return (
                        <button
                          key={`more-${row.branchKey}`}
                          type="button"
                          className="post-thread-more"
                          onClick={() =>
                            setExpandedBranches((current) =>
                              new Set(current).add(row.branchKey)
                            )
                          }
                        >
                          {row.hiddenCount === 1
                            ? 'Show 1 more reply'
                            : `Show ${row.hiddenCount} more replies`}
                        </button>
                      );
                    }

                    const next = replyRows[index + 1];
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
                    ]
                      .filter(Boolean)
                      .join(' ');

                    return (
                      <div key={postKey(row.post)}>
                        {index > 0 && !row.connectedToPrevious ? (
                          <Divider
                            variant="item"
                            className="post-row-divider"
                          />
                        ) : null}
                        <div className={itemClassName}>
                          <PostCard
                            post={row.post}
                            authorProfile={
                              postAuthorProfiles[row.post.accountId]
                            }
                            actionHref={postThreadPath(row.post)}
                            showRelationBadge={false}
                            className={
                              row.connectedToPrevious
                                ? 'post-card--chain-cont'
                                : undefined
                            }
                            engagement={engagement[postKey(row.post)]}
                            reactionPending={isReactionPending(row.post)}
                            onToggleReaction={toggleReaction}
                            onReply={replyHandler}
                            onQuote={quoteHandler}
                            pollTally={pollTallyFor(row.post)}
                            pollVotePending={isPollVotePending(row.post)}
                            onPollVote={(post, optionIndex) => {
                              void castVote(post, optionIndex);
                            }}
                          />
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div className="guild-state-card">No replies yet.</div>
                )
              ) : quotes.length > 0 ? (
                quotes.map((quote, index) => (
                  <div key={postKey(quote)}>
                    {index > 0 ? (
                      <Divider variant="item" className="post-row-divider" />
                    ) : null}
                    <PostCard
                      post={quote}
                      authorProfile={postAuthorProfiles[quote.accountId]}
                      actionHref={postThreadPath(quote)}
                      showRelationBadge={false}
                      quotedPost={conversation.root ?? undefined}
                      quotedAuthorProfile={
                        conversation.root
                          ? postAuthorProfiles[conversation.root.accountId]
                          : undefined
                      }
                      engagement={engagement[postKey(quote)]}
                      reactionPending={isReactionPending(quote)}
                      onToggleReaction={toggleReaction}
                      onReply={replyHandler}
                      onQuote={quoteHandler}
                      pollTally={pollTallyFor(quote)}
                      pollVotePending={isPollVotePending(quote)}
                      onPollVote={(post, optionIndex) => {
                        void castVote(post, optionIndex);
                      }}
                    />
                  </div>
                ))
              ) : (
                <div className="guild-state-card">No quotes yet.</div>
              )}

              {(activeThreadTab === 'replies' && hasMoreReplies) ||
              (activeThreadTab === 'quotes' && hasMoreQuotes) ? (
                <button
                  type="button"
                  className="guild-load-more"
                  disabled={loadingMore}
                  onClick={() => void loadMore(activeThreadTab)}
                >
                  {loadingMore
                    ? 'Loading…'
                    : activeThreadTab === 'replies'
                      ? 'Show more replies'
                      : 'Show more quotes'}
                </button>
              ) : null}
            </div>
          </section>
        ) : null}
      </div>
      {modalTarget ? (
        <ComposerSheet
          open
          target={modalTarget}
          targetAuthorProfile={postAuthorProfiles[modalTarget.accountId]}
          mode={modalMode}
          onModeChange={setModalMode}
          pending={modalPending}
          error={modalError}
          onClose={() => {
            if (!modalPending) setModalTarget(null);
          }}
          onSubmit={(payload) => void submitFromModal(payload)}
        />
      ) : null}
    </OsAppScreen>
  );
}
