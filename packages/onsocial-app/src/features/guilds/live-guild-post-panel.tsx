'use client';

import Link from 'next/link';
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
} from 'react';
import type { GroupConversation } from '@onsocial/sdk';
import { Divider } from '@onsocial/ui';
import { OsAppScreen } from '@/components/app/os-app-screen';
import { TransactionFeedbackToast } from '@/components/ui/transaction-feedback-toast';
import { useAppWallet } from '@/contexts/app-wallet-context';
import { PostCard, postKey } from '@/features/home/post-card';
import { collectRelayTxHashes, guildPath } from '@/features/guilds/guilds-data';
import { useAppOnSocialClient } from '@/hooks/use-app-onsocial-client';
import { useNearTransactionFeedback } from '@/hooks/use-near-transaction-feedback';
import { usePostAuthorProfiles } from '@/hooks/use-post-author-profiles';
import { usePostEngagement } from '@/hooks/use-post-engagement';
import { createReadOnlyOnSocialClient } from '@/lib/create-readonly-onsocial-client';
import {
  txToastError,
  txToastPending,
  txToastSuccess,
} from '@/lib/transaction-toast-copy';
import { isWalletUserCancellation } from '@/lib/wallet-errors';

type LoadState = 'loading' | 'ready' | 'missing' | 'error';
type ThreadTab = 'replies' | 'quotes';

interface LiveGuildPostPanelProps {
  groupId: string;
  author: string;
  postId: string;
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
  const [isMember, setIsMember] = useState(false);
  const [replyText, setReplyText] = useState('');
  const [replyPending, setReplyPending] = useState(false);
  const [activeThreadTab, setActiveThreadTab] = useState<ThreadTab>('replies');
  const [error, setError] = useState<string | null>(null);
  const postAuthorIds = useMemo(
    () =>
      [
        conversation.root?.accountId,
        ...conversation.replies.map((reply) => reply.accountId),
        ...conversation.quotes.map((quote) => quote.accountId),
      ].filter((accountId): accountId is string => Boolean(accountId)),
    [conversation]
  );
  const postAuthorProfiles = usePostAuthorProfiles(postAuthorIds);
  const threadPosts = useMemo(
    () => [
      ...(conversation.root ? [conversation.root] : []),
      ...conversation.replies,
      ...conversation.quotes,
    ],
    [conversation]
  );
  const { engagement, toggleReaction, isReactionPending } = usePostEngagement(
    threadPosts,
    {
      onError: (message) => setTxResult({ type: 'error', msg: message }),
    }
  );

  const refresh = useCallback(async () => {
    setLoadState('loading');
    setError(null);

    try {
      const client = createReadOnlyOnSocialClient();
      const [conversationResult, memberResult] = await Promise.allSettled([
        client.query.groups.conversation(
          { author, groupId, postId },
          { replyLimit: 50, quoteLimit: 12 }
        ),
        accountId
          ? client.groups.isMember(groupId, accountId)
          : Promise.resolve(false),
      ]);

      if (conversationResult.status === 'rejected') {
        throw conversationResult.reason;
      }

      setConversation(conversationResult.value);
      setIsMember(
        memberResult.status === 'fulfilled' ? memberResult.value : false
      );
      setLoadState(conversationResult.value.root ? 'ready' : 'missing');
    } catch (cause) {
      setLoadState('error');
      setError(
        cause instanceof Error ? cause.message : 'Could not load guild thread.'
      );
    }
  }, [accountId, author, groupId, postId]);

  useEffect(() => {
    if (walletLoading) return;
    void refresh();
  }, [refresh, walletLoading]);

  const submitReply = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const text = replyText.trim();
    if (!text || replyPending) return;

    setError(null);

    if (!isConnected) {
      await connect();
      return;
    }

    if (!isMember) {
      setError('Join this guild before replying.');
      return;
    }

    setReplyPending(true);
    try {
      const { client } = await getClient();
      const response = await client.groups.replyToPost(
        groupId,
        { author, groupId, postId },
        {
          text,
          access: 'group',
          groupId,
          timestamp: Date.now(),
        }
      );
      const confirmed = await trackTransaction({
        txHashes: collectRelayTxHashes(response),
        submittedMessage: txToastPending.postingToGuild,
        successMessage: txToastSuccess.guildPostPublished,
        failureMessage: txToastError.guildPostFailed,
      });

      if (confirmed) {
        setReplyText('');
        await refresh();
      }
    } catch (cause) {
      if (isWalletUserCancellation(cause)) return;
      setError(
        cause instanceof Error ? cause.message : 'Could not reply to thread.'
      );
    } finally {
      setReplyPending(false);
    }
  };

  return (
    <OsAppScreen
      title="Guild thread"
      subtitle={groupId}
      backFallbackHref={guildPath(groupId)}
    >
      <div className="guilds-page">
        <div className="guild-thread-toolbar">
          <Link className="guild-secondary-link" href={guildPath(groupId)}>
            Back to {groupId}
          </Link>
          <span>Guild / Discussion</span>
        </div>

        {loadState === 'loading' ? (
          <div className="guild-state-card">Loading thread…</div>
        ) : null}

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
          <>
            <section className="guild-conversation-shell">
              <div className="guild-section-head guild-conversation-head">
                <p className="guild-eyebrow">Guild discussion</p>
                <h2>One post, one conversation.</h2>
              </div>
              <PostCard
                post={conversation.root}
                authorProfile={postAuthorProfiles[conversation.root.accountId]}
                engagement={engagement[postKey(conversation.root)]}
                reactionPending={isReactionPending(conversation.root)}
                onToggleReaction={toggleReaction}
              />

              {isMember ? (
                <form
                  className="post-composer guild-thread-composer"
                  onSubmit={submitReply}
                >
                  <label
                    className="post-composer-label"
                    htmlFor="guild-thread-reply"
                  >
                    Add a reply
                  </label>
                  <textarea
                    id="guild-thread-reply"
                    className="post-composer-input"
                    rows={3}
                    placeholder="Add a clear comment to this guild thread."
                    value={replyText}
                    disabled={replyPending}
                    onChange={(event) => setReplyText(event.target.value)}
                  />
                  <div className="post-composer-actions">
                    <button
                      className="post-composer-submit"
                      type="submit"
                      disabled={replyPending || !replyText.trim()}
                    >
                      {replyPending ? 'Replying…' : 'Reply'}
                    </button>
                  </div>
                </form>
              ) : (
                <div className="guild-state-card">
                  Join this guild before replying. Thread history stays public.
                </div>
              )}

              {error ? <p className="guild-form-error">{error}</p> : null}
            </section>

            <section className="guild-thread-panel">
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
                  <span>{conversation.replies.length}</span>
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
                  <span>{conversation.quotes.length}</span>
                </button>
              </div>

              <div className="guild-connected-stack" role="tabpanel">
                {activeThreadTab === 'replies' ? (
                  conversation.replies.length > 0 ? (
                    conversation.replies.map((reply, index) => (
                      <div key={postKey(reply)}>
                        {index > 0 ? (
                          <Divider
                            variant="item"
                            className="post-row-divider"
                          />
                        ) : null}
                        <PostCard
                          post={reply}
                          authorProfile={postAuthorProfiles[reply.accountId]}
                          contextLabel="Replying in this thread"
                          engagement={engagement[postKey(reply)]}
                          reactionPending={isReactionPending(reply)}
                          onToggleReaction={toggleReaction}
                        />
                      </div>
                    ))
                  ) : (
                    <div className="guild-state-card">
                      No replies yet. Members can start the thread here.
                    </div>
                  )
                ) : conversation.quotes.length > 0 ? (
                  conversation.quotes.map((quote, index) => (
                    <div key={postKey(quote)}>
                      {index > 0 ? (
                        <Divider variant="item" className="post-row-divider" />
                      ) : null}
                      <PostCard
                        post={quote}
                        authorProfile={postAuthorProfiles[quote.accountId]}
                        contextLabel="Quoting this guild post"
                        engagement={engagement[postKey(quote)]}
                        reactionPending={isReactionPending(quote)}
                        onToggleReaction={toggleReaction}
                      />
                    </div>
                  ))
                ) : (
                  <div className="guild-state-card">
                    No quotes yet. Related takes will appear here.
                  </div>
                )}
              </div>
            </section>
          </>
        ) : null}
      </div>
      <TransactionFeedbackToast result={txResult} onClose={clearTxResult} />
    </OsAppScreen>
  );
}
