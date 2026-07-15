'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import type { GroupConversation, PostRow, ThreadNode } from '@onsocial/sdk';
import { Divider } from '@onsocial/ui';
import { OsAppScreen } from '@/components/app/os-app-screen';
import { useAppWallet } from '@/contexts/app-wallet-context';
import { useAppTransactionFeedback } from '@/contexts/app-transaction-feedback-context';
import { useRegisterComposeAction } from '@/contexts/compose-launcher-context';
import { PostCard, PostRowSkeleton, postKey } from '@/features/home/post-card';
import { extractHashtagsFromText } from '@/features/home/home-hashtag-search';
import {
  GuildComposerSheet,
  type GuildComposerMode,
  type GuildComposerSubmit,
} from '@/features/guilds/guild-composer-sheet';
import {
  canViewerPostInChannel,
  parseGuildStructure,
  type GuildStructureDocument,
  type GuildViewerAccess,
} from '@/features/guilds/guild-structure';
import {
  inheritedGuildReplyFeedMeta,
  parseGuildPostAudiences,
} from '@/features/guilds/guild-post-feed-meta';
import {
  collectRelayTxHashes,
  guildPath,
  guildPostPath,
} from '@/features/guilds/guilds-data';
import { resolveGuildViewerAccess } from '@/features/guilds/guild-viewer-access';
import { resolveViewerAllowlistSpaceIds } from '@/features/guilds/guild-space-write';
import { useAppOnSocialClient } from '@/hooks/use-app-onsocial-client';
import { usePostAuthorProfiles } from '@/hooks/use-post-author-profiles';
import { usePostEngagement } from '@/hooks/use-post-engagement';
import { usePollVotes } from '@/hooks/use-poll-votes';
import { useAncestorChain, useQuotedPosts } from '@/hooks/use-quoted-posts';
import { createReadOnlyOnSocialClient } from '@/lib/create-readonly-onsocial-client';
import {
  buildReplyRows,
  flattenTreePosts,
  leafThreadNode,
  withoutIndexedPosts,
  type ThreadReplyRow,
} from '@/lib/thread-display';
import {
  applyMediaKindOverride,
  buildOptimisticMediaEntries,
  readPostMediaUnmuteIndex,
} from '@/lib/post-media';
import {
  txToastConfirming,
  txToastError,
  txToastSuccess,
} from '@/lib/transaction-toast-copy';
import { isWalletUserCancellation } from '@/lib/wallet-errors';
import { playPostFocusVideo } from '@/hooks/use-post-list-video';

type LoadState = 'loading' | 'ready' | 'missing' | 'error';
type ThreadTab = 'replies' | 'quotes';

const REPLY_PAGE_SIZE = 50;
const QUOTE_PAGE_SIZE = 12;
const REPLY_TREE_DEPTH = 6;
const REPLY_TREE_MAX_NODES = 300;
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
  const { setTxResult, trackTransaction } = useAppTransactionFeedback();
  const searchParams = useSearchParams();
  const mediaUnmuted = searchParams.get('media') === 'unmute';
  const mediaResumeIndex = readPostMediaUnmuteIndex(searchParams);
  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [conversation, setConversation] = useState<GroupConversation>({
    root: null,
    replies: [],
    quotes: [],
  });
  const [replyTree, setReplyTree] = useState<ThreadNode[]>([]);
  const [localReplies, setLocalReplies] = useState<PostRow[]>([]);
  const [localQuotes, setLocalQuotes] = useState<PostRow[]>([]);
  const [guildStructure, setGuildStructure] =
    useState<GuildStructureDocument | null>(null);
  const [viewerAccess, setViewerAccess] = useState<GuildViewerAccess>({
    isMember: false,
    isOwner: false,
    isAdmin: false,
    canModerate: false,
  });
  const [isMember, setIsMember] = useState(false);
  const [modalTarget, setModalTarget] = useState<PostRow | null>(null);
  const [modalMode, setModalMode] = useState<GuildComposerMode>('reply');
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

  const rootPath = groupPostContentPath(author, groupId, postId);
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
        const postRef = { author, groupId, postId };
        const [rootResult, quotesResult, treeResult, configResult] =
          await Promise.allSettled([
            client.query.groups.post(postRef),
            client.query.groups.quotes(postRef, {
              limit: QUOTE_PAGE_SIZE,
              order: 'desc',
            }),
            client.query.groups.threadTree(postRef, {
              depth: REPLY_TREE_DEPTH,
              includeQuotes: false,
              replyLimit: REPLY_PAGE_SIZE,
              maxNodes: REPLY_TREE_MAX_NODES,
            }),
            client.groups.getConfig(groupId),
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

        setLocalReplies((current) => withoutIndexedPosts(current, fetchedTreePosts));
        setLocalQuotes((current) => withoutIndexedPosts(current, fetchedQuotes));

        // Once the user paginated past the first page, a background
        // first-page fetch would discard loaded pages — reconcile only.
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

        const rawConfig =
          configResult.status === 'fulfilled' ? configResult.value : null;

        if (rawConfig) {
          setGuildStructure(parseGuildStructure(rawConfig));
        } else {
          setGuildStructure(null);
        }

        if (accountId && rawConfig) {
          const structure = parseGuildStructure(rawConfig);
          const { viewer } = await resolveGuildViewerAccess(
            client,
            groupId,
            accountId,
            {
              memberDriven:
                rawConfig.member_driven === true ||
                rawConfig.memberDriven === true,
              accessGated:
                rawConfig.is_private === true || rawConfig.isPrivate === true,
            }
          );
          const canWriteSpaceIds = await resolveViewerAllowlistSpaceIds(
            client,
            groupId,
            accountId,
            structure,
            viewer
          );
          setViewerAccess({ ...viewer, canWriteSpaceIds });
          setIsMember(viewer.isMember);
        } else {
          setViewerAccess({
            isMember: false,
            isOwner: false,
            isAdmin: false,
            canModerate: false,
          });
          setIsMember(false);
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
          // Extra pages join as top-level rows; their own descendants
          // arrive with the next full refresh.
          setReplyTree((current) => [
            ...current,
            ...page.map((post) =>
              leafThreadNode(
                post,
                groupPostContentPath(post.accountId, groupId, post.postId)
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
    [
      conversation.quotes.length,
      conversation.replies.length,
      groupId,
      loadingMore,
      rootPath,
    ]
  );

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
    files: File[] = []
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
    const hashtags = extractHashtagsFromText(text);
    const postData = {
      text,
      access: 'group' as const,
      groupId,
      timestamp: Date.now(),
      ...(hashtags.length > 0 ? { hashtags } : {}),
      ...feedMeta,
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
    files: File[] = []
  ) => {
    if (!accountId) return;
    const feedMeta = applyMediaKindOverride(
      conversation.root ? inheritedGuildReplyFeedMeta(conversation.root) : {},
      files
    );
    const hashtags = extractHashtagsFromText(text);
    const media = files.length ? buildOptimisticMediaEntries(files) : undefined;
    // Chain-confirmed; show immediately while the indexer catches up.
    const confirmedRow: PostRow = {
      accountId,
      postId: newPostId,
      value: JSON.stringify({
        v: 1,
        text,
        ...(hashtags.length > 0 ? { hashtags } : {}),
        ...(media ? { media } : {}),
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
    }
    setActiveThreadTab(mode === 'quote' ? 'quotes' : 'replies');
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
        files
      );
      if (confirmed) {
        const targetsRoot =
          conversation.root && postKey(target) === postKey(conversation.root);
        if (targetsRoot) {
          insertConfirmedRootChild(modalMode, text, newPostId, files);
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
    ? (post: PostRow) => {
        const channel = post.channel ?? threadChannel;
        if (!canPostInChannel(channel)) return;
        openComposerModal('reply')(post);
      }
    : undefined;
  const quoteHandler = canPostInThread
    ? (post: PostRow) => {
        const channel = post.channel ?? threadChannel;
        if (!canPostInChannel(channel)) return;
        openComposerModal('quote')(post);
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

  // Dock pen on a thread page = reply to the thread root.
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
                  // Parent drawn above with a chain line already says "reply".
                  showRelationBadge={!hasParent}
                  // Thread is reached from anywhere — root keeps channel context.
                  showChannel
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
                id="guild-thread-tab-replies"
                aria-controls="guild-thread-panel"
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
                id="guild-thread-tab-quotes"
                aria-controls="guild-thread-panel"
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
                            actionHref={guildPostPath(
                              groupId,
                              row.post.accountId,
                              row.post.postId
                            )}
                            // Position under the root already says "reply".
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
        <GuildComposerSheet
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
