'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { GroupConversation, PostRow } from '@onsocial/sdk';
import { Divider } from '@onsocial/ui';
import { OsAppScreen } from '@/components/app/os-app-screen';
import { TransactionFeedbackToast } from '@/components/ui/transaction-feedback-toast';
import { useAppWallet } from '@/contexts/app-wallet-context';
import { PostCard, PostRowSkeleton, postKey } from '@/features/home/post-card';
import {
  GuildComposerModal,
  type GuildComposerMode,
} from '@/features/guilds/guild-composer-modal';
import {
  collectRelayTxHashes,
  guildPath,
  guildPostPath,
} from '@/features/guilds/guilds-data';
import { useAppOnSocialClient } from '@/hooks/use-app-onsocial-client';
import { useNearTransactionFeedback } from '@/hooks/use-near-transaction-feedback';
import { usePostAuthorProfiles } from '@/hooks/use-post-author-profiles';
import { usePostEngagement } from '@/hooks/use-post-engagement';
import {
  parseGroupPostPath,
  useQuotedPosts,
  useResolvedGroupPosts,
} from '@/hooks/use-quoted-posts';
import { createReadOnlyOnSocialClient } from '@/lib/create-readonly-onsocial-client';
import {
  txToastError,
  txToastPending,
  txToastSuccess,
} from '@/lib/transaction-toast-copy';
import { isWalletUserCancellation } from '@/lib/wallet-errors';

type LoadState = 'loading' | 'ready' | 'missing' | 'error';
type ThreadTab = 'replies' | 'quotes';

const REPLY_PAGE_SIZE = 50;
const QUOTE_PAGE_SIZE = 12;
const RECONCILE_DELAYS_MS = [2_000, 5_000];

interface LiveGuildPostPanelProps {
  groupId: string;
  author: string;
  postId: string;
}

function groupPostContentPath(
  postAuthor: string,
  groupId: string,
  targetPostId: string
): string {
  return `${postAuthor}/groups/${groupId}/content/post/${targetPostId}`;
}

/** Drop locally-confirmed rows once the indexed list contains them. */
function withoutIndexed(local: PostRow[], indexed: PostRow[]): PostRow[] {
  const indexedKeys = new Set(indexed.map(postKey));
  return local.filter((row) => !indexedKeys.has(postKey(row)));
}

export function LiveGuildPostPanel({
  groupId,
  author,
  postId,
}: LiveGuildPostPanelProps) {
  const {
    accountId,
    isConnected,
    isLoading: walletLoading,
    connect,
  } = useAppWallet();
  const { getClient } = useAppOnSocialClient();
  const { txResult, setTxResult, clearTxResult, trackTransaction } =
    useNearTransactionFeedback(accountId);
  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [conversation, setConversation] = useState<GroupConversation>({
    root: null,
    replies: [],
    quotes: [],
  });
  const [localReplies, setLocalReplies] = useState<PostRow[]>([]);
  const [localQuotes, setLocalQuotes] = useState<PostRow[]>([]);
  const [isMember, setIsMember] = useState(false);
  const [modalTarget, setModalTarget] = useState<PostRow | null>(null);
  const [modalMode, setModalMode] = useState<GuildComposerMode>('reply');
  const [modalPending, setModalPending] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);
  const [activeThreadTab, setActiveThreadTab] = useState<ThreadTab>('replies');
  const [hasMoreReplies, setHasMoreReplies] = useState(false);
  const [hasMoreQuotes, setHasMoreQuotes] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const paginatedRef = useRef(false);
  const reconcileTimersRef = useRef<number[]>([]);

  const rootPath = groupPostContentPath(author, groupId, postId);
  const replies = useMemo(
    () => [
      ...conversation.replies,
      ...withoutIndexed(localReplies, conversation.replies),
    ],
    [conversation.replies, localReplies]
  );
  const quotes = useMemo(
    () => [
      ...conversation.quotes,
      ...withoutIndexed(localQuotes, conversation.quotes),
    ],
    [conversation.quotes, localQuotes]
  );
  const threadPosts = useMemo(
    () => [
      ...(conversation.root ? [conversation.root] : []),
      ...replies,
      ...quotes,
    ],
    [conversation.root, replies, quotes]
  );
  const quotedPosts = useQuotedPosts(threadPosts);
  const parentPosts = useResolvedGroupPosts([conversation.root?.parentPath]);
  const parentPost = conversation.root?.parentPath
    ? parentPosts[conversation.root.parentPath]
    : undefined;
  const parentRef = conversation.root?.parentPath
    ? parseGroupPostPath(conversation.root.parentPath)
    : null;
  const postAuthorIds = useMemo(
    () => [
      ...threadPosts.map((post) => post.accountId),
      ...Object.values(quotedPosts).map((post) => post.accountId),
      ...(parentPost ? [parentPost.accountId] : []),
    ],
    [threadPosts, quotedPosts, parentPost]
  );
  const postAuthorProfiles = usePostAuthorProfiles(postAuthorIds);
  const { engagement, toggleReaction, isReactionPending } = usePostEngagement(
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
        const [conversationResult, memberResult] = await Promise.allSettled([
          client.query.groups.conversation(
            { author, groupId, postId },
            { replyLimit: REPLY_PAGE_SIZE, quoteLimit: QUOTE_PAGE_SIZE }
          ),
          accountId
            ? client.groups.isMember(groupId, accountId)
            : Promise.resolve(false),
        ]);

        if (conversationResult.status === 'rejected') {
          throw conversationResult.reason;
        }

        const fetched = conversationResult.value;
        setLocalReplies((current) => withoutIndexed(current, fetched.replies));
        setLocalQuotes((current) => withoutIndexed(current, fetched.quotes));

        // Once the user paginated past the first page, a background
        // first-page fetch would discard loaded pages — reconcile only.
        if (!options.background || !paginatedRef.current) {
          setConversation(fetched);
          setHasMoreReplies(fetched.replies.length >= REPLY_PAGE_SIZE);
          setHasMoreQuotes(fetched.quotes.length >= QUOTE_PAGE_SIZE);
        }

        setIsMember(
          memberResult.status === 'fulfilled' ? memberResult.value : false
        );
        if (!options.background) {
          setLoadState(fetched.root ? 'ready' : 'missing');
        }
      } catch (cause) {
        if (options.background) return;
        setLoadState('error');
        setError(
          cause instanceof Error
            ? cause.message
            : 'Could not load guild thread.'
        );
      }
    },
    [accountId, author, groupId, postId]
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
          setHasMoreReplies(page.length >= REPLY_PAGE_SIZE);
        } else {
          const page = await client.query.threads.quotesByPath(rootPath, {
            limit: QUOTE_PAGE_SIZE,
            offset: conversation.quotes.length,
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
    [
      conversation.quotes.length,
      conversation.replies.length,
      loadingMore,
      rootPath,
    ]
  );

  const performSubmit = async (
    target: { author: string; postId: string },
    mode: GuildComposerMode,
    text: string
  ): Promise<{ confirmed: boolean; newPostId: string }> => {
    const newPostId = Date.now().toString();
    const { client } = await getClient();
    const ref = { author: target.author, groupId, postId: target.postId };
    const postData = {
      text,
      access: 'group' as const,
      groupId,
      timestamp: Date.now(),
    };
    const response =
      mode === 'quote'
        ? await client.groups.quotePost(groupId, ref, postData, newPostId)
        : await client.groups.replyToPost(groupId, ref, postData, newPostId);
    const confirmed = await trackTransaction({
      txHashes: collectRelayTxHashes(response),
      submittedMessage:
        mode === 'quote'
          ? txToastPending.quotingGuildPost
          : txToastPending.postingToGuild,
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
    newPostId: string
  ) => {
    if (!accountId) return;
    // Chain-confirmed; show immediately while the indexer catches up.
    const confirmedRow: PostRow = {
      accountId,
      postId: newPostId,
      value: JSON.stringify({ v: 1, text }),
      blockHeight: 0,
      blockTimestamp: Date.now(),
      groupId,
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
    }
    setActiveThreadTab(mode === 'quote' ? 'quotes' : 'replies');
    scheduleReconcile();
  };

  const openComposerModal = (mode: GuildComposerMode) => (target: PostRow) => {
    setModalMode(mode);
    setModalError(null);
    setModalTarget(target);
  };

  const submitFromModal = async (text: string) => {
    const target = modalTarget;
    if (!target || modalPending) return;

    if (!isConnected || !accountId) {
      await connect();
      return;
    }

    setModalError(null);
    setModalPending(true);
    try {
      const { confirmed, newPostId } = await performSubmit(
        { author: target.accountId, postId: target.postId },
        modalMode,
        text
      );
      if (confirmed) {
        const targetsRoot =
          conversation.root && postKey(target) === postKey(conversation.root);
        if (targetsRoot) {
          insertConfirmedRootChild(modalMode, text, newPostId);
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

  const replyHandler = isMember ? openComposerModal('reply') : undefined;
  const quoteHandler = isMember ? openComposerModal('quote') : undefined;

  return (
    <OsAppScreen
      title="Guild thread"
      subtitle={groupId}
      backFallbackHref={guildPath(groupId)}
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
            <p>{error ?? 'Could not load guild thread.'}</p>
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
              {parentPost && parentRef ? (
                <div className="guild-thread-ancestor">
                  <PostCard
                    post={parentPost}
                    authorProfile={postAuthorProfiles[parentPost.accountId]}
                    actionHref={guildPostPath(
                      groupId,
                      parentRef.author,
                      parentRef.postId
                    )}
                    showRelationBadge={false}
                    className="post-card--chain-down"
                    onReply={replyHandler}
                    onQuote={quoteHandler}
                  />
                </div>
              ) : null}

              <div className="guild-thread-root">
                <PostCard
                  post={conversation.root}
                  authorProfile={
                    postAuthorProfiles[conversation.root.accountId]
                  }
                  className={parentPost ? 'post-card--chain-up' : undefined}
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
                  engagement={engagement[postKey(conversation.root)]}
                  reactionPending={isReactionPending(conversation.root)}
                  onToggleReaction={toggleReaction}
                  onReply={replyHandler}
                  onQuote={quoteHandler}
                />
              </div>
            </div>

            <Divider variant="detail" />

            {isMember ? (
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
                Join this guild before replying. Thread history stays public.
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
                aria-selected={activeThreadTab === 'replies'}
                className={
                  activeThreadTab === 'replies' ? 'is-active' : undefined
                }
                onClick={() => setActiveThreadTab('replies')}
              >
                Replies
                <span>{replies.length}</span>
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={activeThreadTab === 'quotes'}
                className={
                  activeThreadTab === 'quotes' ? 'is-active' : undefined
                }
                onClick={() => setActiveThreadTab('quotes')}
              >
                Quotes
                <span>{quotes.length}</span>
              </button>
            </div>

            <div className="guild-connected-stack" role="tabpanel">
              {activeThreadTab === 'replies' ? (
                replies.length > 0 ? (
                  replies.map((reply, index) => {
                    const sameAuthorAsPrevious =
                      index > 0 &&
                      replies[index - 1]!.accountId === reply.accountId;
                    const sameAuthorAsNext =
                      index < replies.length - 1 &&
                      replies[index + 1]!.accountId === reply.accountId;
                    const chainClassName =
                      [
                        sameAuthorAsPrevious ? 'post-card--chain-up' : null,
                        sameAuthorAsPrevious ? 'post-card--chain-cont' : null,
                        sameAuthorAsNext ? 'post-card--chain-down' : null,
                      ]
                        .filter(Boolean)
                        .join(' ') || undefined;

                    return (
                      <div key={postKey(reply)}>
                        {index > 0 && !sameAuthorAsPrevious ? (
                          <Divider
                            variant="item"
                            className="post-row-divider"
                          />
                        ) : null}
                        <PostCard
                          post={reply}
                          authorProfile={postAuthorProfiles[reply.accountId]}
                          actionHref={guildPostPath(
                            groupId,
                            reply.accountId,
                            reply.postId
                          )}
                          showRelationBadge={false}
                          className={chainClassName}
                          engagement={engagement[postKey(reply)]}
                          reactionPending={isReactionPending(reply)}
                          onToggleReaction={toggleReaction}
                          onReply={replyHandler}
                          onQuote={quoteHandler}
                        />
                      </div>
                    );
                  })
                ) : (
                  <div className="guild-state-card">
                    No replies yet. Members can start the thread here.
                  </div>
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
                      actionHref={guildPostPath(
                        groupId,
                        quote.accountId,
                        quote.postId
                      )}
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
                    />
                  </div>
                ))
              ) : (
                <div className="guild-state-card">
                  No quotes yet. Related takes will appear here.
                </div>
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
        <GuildComposerModal
          target={modalTarget}
          targetAuthorProfile={postAuthorProfiles[modalTarget.accountId]}
          mode={modalMode}
          onModeChange={setModalMode}
          pending={modalPending}
          error={modalError}
          onClose={() => {
            if (!modalPending) setModalTarget(null);
          }}
          onSubmit={(text) => void submitFromModal(text)}
        />
      ) : null}
      <TransactionFeedbackToast result={txResult} onClose={clearTxResult} />
    </OsAppScreen>
  );
}
