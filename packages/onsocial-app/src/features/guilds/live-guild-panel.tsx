'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  postContentPath,
  type GroupStats,
  type JoinRequest,
  type PostRow,
} from '@onsocial/sdk';
import { Divider } from '@onsocial/ui';
import { OsAppScreen } from '@/components/app/os-app-screen';
import { TransactionFeedbackToast } from '@/components/ui/transaction-feedback-toast';
import { useAppWallet } from '@/contexts/app-wallet-context';
import { useRegisterComposeAction } from '@/contexts/compose-launcher-context';
import { PostRowSkeleton, postKey } from '@/features/home/post-card';
import {
  GuildComposerModal,
  type GuildComposerMode,
} from '@/features/guilds/guild-composer-modal';
import {
  collectRelayTxHashes,
  DEFAULT_GUILD_STRUCTURE,
  GUILD_STRUCTURE_TEMPLATES,
  guildSectionPath,
} from '@/features/guilds/guilds-data';
import { FeedThreadBlock } from '@/features/guilds/feed-thread-block';
import { useAppOnSocialClient } from '@/hooks/use-app-onsocial-client';
import { coalesceFeedThreads } from '@/lib/feed-threads';
import { useNearTransactionFeedback } from '@/hooks/use-near-transaction-feedback';
import { usePostAuthorProfiles } from '@/hooks/use-post-author-profiles';
import { usePostEngagement } from '@/hooks/use-post-engagement';
import { useQuotedPosts } from '@/hooks/use-quoted-posts';
import { createReadOnlyOnSocialClient } from '@/lib/create-readonly-onsocial-client';
import {
  txToastError,
  txToastPending,
  txToastSuccess,
} from '@/lib/transaction-toast-copy';
import { isWalletUserCancellation } from '@/lib/wallet-errors';

interface LiveGuildConfig {
  name: string;
  description: string | null;
  accessGated: boolean;
  memberDriven: boolean;
  tags: string[];
}

interface ViewerGuildState {
  isMember: boolean;
  isOwner: boolean;
  isAdmin: boolean;
  canModerate: boolean;
  joinRequest: JoinRequest | null;
}

interface LiveGuildState {
  config: LiveGuildConfig | null;
  stats: GroupStats | null;
  posts: PostRow[];
  feedError: string | null;
  viewer: ViewerGuildState | null;
}

type LoadState = 'loading' | 'ready' | 'missing' | 'error';
type GuildFeedFilterId = 'all' | string;

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null;
}

function readBoolean(value: unknown): boolean {
  return value === true;
}

function normalizeConfig(
  groupId: string,
  raw: Record<string, unknown>
): LiveGuildConfig {
  const rawTags = Array.isArray(raw.tags)
    ? raw.tags.filter((tag): tag is string => typeof tag === 'string')
    : [];

  return {
    name: readString(raw.name) ?? groupId,
    description: readString(raw.description),
    accessGated: readBoolean(raw.is_private) || readBoolean(raw.isPrivate),
    memberDriven:
      readBoolean(raw.member_driven) || readBoolean(raw.memberDriven),
    tags: rawTags,
  };
}

function pendingJoinRequest(request: JoinRequest | null): boolean {
  return request?.status === 'pending';
}

function roleLabel(viewer: ViewerGuildState | null): string {
  if (!viewer) return 'Visitor';
  if (viewer.isOwner) return 'Owner';
  if (viewer.isAdmin) return 'Admin';
  if (viewer.canModerate) return 'Moderator';
  if (viewer.isMember) return 'Member';
  if (pendingJoinRequest(viewer.joinRequest)) return 'Request pending';
  return 'Visitor';
}

function accessLabel(config: LiveGuildConfig): string {
  return config.accessGated ? 'Access-gated' : 'Open access';
}

export function LiveGuildPanel({ groupId }: { groupId: string }) {
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
  const [state, setState] = useState<LiveGuildState>({
    config: null,
    stats: null,
    posts: [],
    feedError: null,
    viewer: null,
  });
  const [localPosts, setLocalPosts] = useState<PostRow[]>([]);
  const [hasMorePosts, setHasMorePosts] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [isFeedRefreshing, setIsFeedRefreshing] = useState(false);
  const [actionPending, setActionPending] = useState(false);
  const [selectedStructureId, setSelectedStructureId] = useState(
    DEFAULT_GUILD_STRUCTURE.id
  );
  const [selectedFeedFilterId, setSelectedFeedFilterId] =
    useState<GuildFeedFilterId>('all');
  const [composer, setComposer] = useState<{
    mode: GuildComposerMode;
    target: PostRow | null;
  } | null>(null);
  const [modalPending, setModalPending] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const hasLoadedRef = useRef(false);
  const reconcileTimersRef = useRef<number[]>([]);

  const config = state.config;
  const viewer = state.viewer;
  const joinPending = pendingJoinRequest(viewer?.joinRequest ?? null);
  const canPost = Boolean(viewer?.isMember);
  const title = config?.name ?? groupId;
  const selectedFeedStructure =
    selectedFeedFilterId === 'all'
      ? null
      : (GUILD_STRUCTURE_TEMPLATES.find(
          (structure) => structure.id === selectedFeedFilterId
        ) ?? DEFAULT_GUILD_STRUCTURE);
  const feedPosts = useMemo(() => {
    const indexedKeys = new Set(state.posts.map(postKey));
    const pendingLocal = localPosts.filter(
      (post) =>
        !indexedKeys.has(postKey(post)) &&
        (!selectedFeedStructure ||
          post.channel === selectedFeedStructure.channel)
    );
    return [...pendingLocal, ...state.posts];
  }, [state.posts, localPosts, selectedFeedStructure]);
  const feedBlocks = useMemo(() => coalesceFeedThreads(feedPosts), [feedPosts]);
  const quotedPosts = useQuotedPosts(feedPosts);
  const postAuthorIds = useMemo(
    () => [
      ...feedPosts.map((post) => post.accountId),
      ...Object.values(quotedPosts).map((post) => post.accountId),
    ],
    [feedPosts, quotedPosts]
  );
  const postAuthorProfiles = usePostAuthorProfiles(postAuthorIds);
  const { engagement, toggleReaction, isReactionPending } = usePostEngagement(
    feedPosts,
    {
      onError: (message) => setTxResult({ type: 'error', msg: message }),
    }
  );

  const refresh = useCallback(async () => {
    if (hasLoadedRef.current) {
      setIsFeedRefreshing(true);
    } else {
      setLoadState('loading');
    }
    setError(null);

    try {
      const client = createReadOnlyOnSocialClient();
      const rawConfig = await client.groups.getConfig(groupId);

      if (!rawConfig) {
        setState({
          config: null,
          stats: null,
          posts: [],
          feedError: null,
          viewer: null,
        });
        setLoadState('missing');
        return;
      }

      const [statsResult, feedResult, viewerResult] = await Promise.allSettled([
        client.groups.getStats(groupId),
        selectedFeedStructure
          ? client.query.groups.feedFiltered({
              groupId,
              channel: selectedFeedStructure.channel,
              limit: 20,
            })
          : client.query.groups.feed({ groupId, limit: 20 }),
        accountId
          ? Promise.all([
              client.groups.isMember(groupId, accountId),
              client.groups.isOwner(groupId, accountId),
              client.groups.isAdmin(groupId, accountId),
              client.groups.canModerate(groupId, accountId),
              client.groups.getJoinRequest(groupId, accountId),
            ])
          : Promise.resolve(null),
      ]);

      const viewerState =
        viewerResult.status === 'fulfilled' && viewerResult.value
          ? {
              isMember: viewerResult.value[0],
              isOwner: viewerResult.value[1],
              isAdmin: viewerResult.value[2],
              canModerate: viewerResult.value[3],
              joinRequest: viewerResult.value[4],
            }
          : null;

      const fetchedPosts =
        feedResult.status === 'fulfilled' ? (feedResult.value.items ?? []) : [];
      const indexedKeys = new Set(fetchedPosts.map(postKey));
      setLocalPosts((current) =>
        current.filter((post) => !indexedKeys.has(postKey(post)))
      );
      setState({
        config: normalizeConfig(groupId, rawConfig),
        stats: statsResult.status === 'fulfilled' ? statsResult.value : null,
        posts: fetchedPosts,
        feedError:
          feedResult.status === 'rejected'
            ? feedResult.reason instanceof Error
              ? feedResult.reason.message
              : 'Could not load guild posts.'
            : null,
        viewer: viewerState,
      });
      setHasMorePosts(
        feedResult.status === 'fulfilled' &&
          feedResult.value.nextOffset !== undefined
      );
      hasLoadedRef.current = true;
      setLoadState('ready');
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
  }, [accountId, groupId, selectedFeedStructure]);

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
      const page = selectedFeedStructure
        ? await client.query.groups.feedFiltered({
            groupId,
            channel: selectedFeedStructure.channel,
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
  }, [groupId, loadingMore, selectedFeedStructure, state.posts.length]);

  const memberCount = state.stats?.member_count ?? 0;
  const proposalCount = state.stats?.proposal_count ?? 0;
  const selectedStructure =
    GUILD_STRUCTURE_TEMPLATES.find(
      (structure) => structure.id === selectedStructureId
    ) ?? DEFAULT_GUILD_STRUCTURE;
  const actionLabel = useMemo(() => {
    if (!isConnected) return 'Connect wallet';
    if (!config) return 'Load guild';
    if (viewer?.isMember) return 'Leave guild';
    if (joinPending) return 'Cancel request';
    return config.accessGated ? 'Request access' : 'Join guild';
  }, [config, isConnected, joinPending, viewer?.isMember]);

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
          ? await client.groups.cancelJoin(groupId)
          : await client.groups.join(groupId);

      const txHashes = collectRelayTxHashes(response);
      const confirmed = await trackTransaction({
        txHashes,
        submittedMessage: viewer?.isMember
          ? txToastPending.leavingGuild
          : joinPending
            ? txToastPending.cancelingGuildRequest
            : config.accessGated
              ? txToastPending.requestingGuildAccess
              : txToastPending.joiningGuild,
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

  const openComposerModal = (mode: GuildComposerMode) => (target: PostRow) => {
    setModalError(null);
    setComposer({ mode, target });
  };

  const openPostComposer = useCallback(() => {
    setModalError(null);
    setComposer({ mode: 'post', target: null });
  }, []);

  useRegisterComposeAction(canPost ? openPostComposer : null);

  const submitFromModal = async (text: string) => {
    if (!composer || modalPending) return;
    const { mode, target } = composer;
    if (mode !== 'post' && !target) return;

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
        response = await client.groups.post(
          groupId,
          {
            text,
            access: 'group',
            groupId,
            channel: selectedStructure.channel,
            kind: selectedStructure.kind,
            audiences: [selectedStructure.audience],
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
        const postData = {
          text,
          access: 'group' as const,
          groupId,
          timestamp: Date.now(),
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

      if (confirmed) {
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
            ...(mode === 'post'
              ? {
                  channel: selectedStructure.channel,
                  kind: selectedStructure.kind,
                }
              : mode === 'quote'
                ? {
                    refAuthor: target!.accountId,
                    refPath: postContentPath(target!),
                    refType: 'post',
                  }
                : {
                    parentAuthor: target!.accountId,
                    parentPath: postContentPath(target!),
                    parentType: 'post',
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

  const replyHandler = canPost ? openComposerModal('reply') : undefined;
  const quoteHandler = canPost ? openComposerModal('quote') : undefined;

  return (
    <OsAppScreen
      title={title}
      subtitle={
        config
          ? `${accessLabel(config)} guild on OnSocial`
          : 'Guilds are public on-chain spaces with access-gated participation.'
      }
      backFallbackHref="/groups"
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
            <section className="guild-hero-card guild-detail-hero">
              <p className="guild-eyebrow">
                {accessLabel(config)} ·{' '}
                {config.memberDriven ? 'Collaborative governance' : 'Owner-led'}
              </p>
              <h2>{config.name}</h2>
              <p>
                {config.description ??
                  'A public on-chain guild. Access controls decide who can join, post, moderate, and manage.'}
              </p>
              <div className="guild-card-meta">
                <span>{memberCount} members</span>
                <span>{proposalCount} proposals</span>
                <span>{roleLabel(viewer)}</span>
              </div>
              {config.tags.length > 0 ? (
                <div className="guild-tag-list">
                  {config.tags.map((tag) => (
                    <span key={tag}>#{tag}</span>
                  ))}
                </div>
              ) : null}
              <div className="guild-hero-actions">
                <button
                  className="guild-primary-button"
                  type="button"
                  disabled={actionPending}
                  onClick={() => void runMembershipAction()}
                >
                  {actionPending ? 'Working…' : actionLabel}
                </button>
                <Link
                  className="guild-secondary-link"
                  href={guildSectionPath(groupId, 'members')}
                >
                  Members
                </Link>
                <Link
                  className="guild-secondary-link"
                  href={guildSectionPath(groupId, 'proposals')}
                >
                  Proposals
                </Link>
                {viewer?.isOwner || viewer?.isAdmin || viewer?.canModerate ? (
                  <Link
                    className="guild-secondary-link"
                    href={guildSectionPath(groupId, 'settings')}
                  >
                    Settings
                  </Link>
                ) : null}
              </div>
            </section>

            {error ? <p className="guild-form-error">{error}</p> : null}

            <section className="guild-section guild-feed-section">
              <div className="guild-section-head">
                <p className="guild-eyebrow">Guild feed</p>
                <h2>
                  {selectedFeedStructure
                    ? selectedFeedStructure.title
                    : 'Member posts'}
                </h2>
              </div>
              <div
                className="guild-feed-filter-list"
                aria-label="Guild feed filters"
              >
                <button
                  className={`guild-feed-filter-button${selectedFeedFilterId === 'all' ? ' is-active' : ''}`}
                  type="button"
                  onClick={() => setSelectedFeedFilterId('all')}
                >
                  All
                </button>
                {GUILD_STRUCTURE_TEMPLATES.map((structure) => (
                  <button
                    key={structure.id}
                    className={`guild-feed-filter-button${selectedFeedFilterId === structure.id ? ' is-active' : ''}`}
                    type="button"
                    onClick={() => setSelectedFeedFilterId(structure.id)}
                  >
                    {structure.title}
                  </button>
                ))}
              </div>
              {canPost ? (
                <button
                  type="button"
                  className="guild-reply-prompt"
                  onClick={openPostComposer}
                >
                  Share something in {config.name}…
                </button>
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
                  {selectedFeedStructure
                    ? `No ${selectedFeedStructure.title.toLowerCase()} posts yet. Members can start this channel from the composer.`
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
            composer.mode === 'post' && config
              ? {
                  name: config.name,
                  channels: GUILD_STRUCTURE_TEMPLATES.map((structure) => ({
                    id: structure.id,
                    title: structure.title,
                  })),
                  selectedChannelId: selectedStructure.id,
                  onChannelChange: setSelectedStructureId,
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
      <TransactionFeedbackToast result={txResult} onClose={clearTxResult} />
    </OsAppScreen>
  );
}
