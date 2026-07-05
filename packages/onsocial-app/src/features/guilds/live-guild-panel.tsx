'use client';

import Link from 'next/link';
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
} from 'react';
import type { GroupStats, JoinRequest, PostRow } from '@onsocial/sdk';
import { OsAppScreen } from '@/components/app/os-app-screen';
import { TransactionFeedbackToast } from '@/components/ui/transaction-feedback-toast';
import { useAppWallet } from '@/contexts/app-wallet-context';
import { PostCard, postKey } from '@/features/home/post-card';
import {
  collectRelayTxHashes,
  guildSectionPath,
} from '@/features/guilds/guilds-data';
import { useAppOnSocialClient } from '@/hooks/use-app-onsocial-client';
import { useNearTransactionFeedback } from '@/hooks/use-near-transaction-feedback';
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
  viewer: ViewerGuildState | null;
}

type LoadState = 'loading' | 'ready' | 'missing' | 'error';

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
  const { txResult, clearTxResult, trackTransaction } =
    useNearTransactionFeedback(accountId);
  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [state, setState] = useState<LiveGuildState>({
    config: null,
    stats: null,
    posts: [],
    viewer: null,
  });
  const [actionPending, setActionPending] = useState(false);
  const [postText, setPostText] = useState('');
  const [postPending, setPostPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const config = state.config;
  const viewer = state.viewer;
  const joinPending = pendingJoinRequest(viewer?.joinRequest ?? null);
  const canPost = Boolean(viewer?.isMember);
  const title = config?.name ?? groupId;

  const refresh = useCallback(async () => {
    setLoadState('loading');
    setError(null);

    try {
      const client = createReadOnlyOnSocialClient();
      const rawConfig = await client.groups.getConfig(groupId);

      if (!rawConfig) {
        setState({ config: null, stats: null, posts: [], viewer: null });
        setLoadState('missing');
        return;
      }

      const [statsResult, feedResult, viewerResult] = await Promise.allSettled([
        client.groups.getStats(groupId),
        client.query.groups.feed({ groupId, limit: 20 }),
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

      setState({
        config: normalizeConfig(groupId, rawConfig),
        stats: statsResult.status === 'fulfilled' ? statsResult.value : null,
        posts:
          feedResult.status === 'fulfilled'
            ? (feedResult.value.items ?? [])
            : [],
        viewer: viewerState,
      });
      setLoadState('ready');
    } catch (cause) {
      setLoadState('error');
      setError(
        cause instanceof Error ? cause.message : 'Could not load guild.'
      );
    }
  }, [accountId, groupId]);

  useEffect(() => {
    if (walletLoading) return;
    void refresh();
  }, [refresh, walletLoading]);

  const memberCount = state.stats?.member_count ?? 0;
  const proposalCount = state.stats?.proposal_count ?? 0;
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

  const submitPost = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const text = postText.trim();
    if (!text || !canPost || postPending) return;

    setPostPending(true);
    setError(null);
    try {
      const { client } = await getClient();
      const response = await client.groups.post(groupId, {
        text,
        access: 'group',
        groupId,
        timestamp: Date.now(),
      });
      const confirmed = await trackTransaction({
        txHashes: collectRelayTxHashes(response),
        submittedMessage: txToastPending.postingToGuild,
        successMessage: txToastSuccess.guildPostPublished,
        failureMessage: txToastError.guildPostFailed,
      });

      if (confirmed) {
        setPostText('');
        await refresh();
      }
    } catch (cause) {
      if (isWalletUserCancellation(cause)) return;
      setError(
        cause instanceof Error ? cause.message : 'Could not post to guild.'
      );
    } finally {
      setPostPending(false);
    }
  };

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
        {loadState === 'loading' ? (
          <div className="guild-state-card">Loading guild…</div>
        ) : null}

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
              <p className="guild-public-note">
                On-chain guild activity is public. Access-gated means membership
                and write permissions are restricted, not that blockchain data
                is hidden.
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
              </div>
            </section>

            {error ? <p className="guild-form-error">{error}</p> : null}

            <section className="guild-section">
              <div className="guild-section-head">
                <p className="guild-eyebrow">Share this guild</p>
                <h2>Others can open this page to join.</h2>
                <p>
                  Send them <code>{`/groups/${groupId}`}</code>. Open guilds can
                  be joined from here; access-gated guilds accept requests from
                  connected accounts.
                </p>
              </div>
            </section>

            <section className="guild-section">
              <div className="guild-section-head">
                <p className="guild-eyebrow">Guild feed</p>
                <h2>Member posts</h2>
              </div>
              {canPost ? (
                <form className="post-composer" onSubmit={submitPost}>
                  <label
                    className="post-composer-label"
                    htmlFor="guild-compose"
                  >
                    Post to {config.name}
                  </label>
                  <textarea
                    id="guild-compose"
                    className="post-composer-input"
                    rows={3}
                    placeholder="Share an update with this guild."
                    value={postText}
                    disabled={postPending}
                    onChange={(event) => setPostText(event.target.value)}
                  />
                  <div className="post-composer-actions">
                    <button
                      className="post-composer-submit"
                      type="submit"
                      disabled={postPending || !postText.trim()}
                    >
                      {postPending ? 'Posting…' : 'Post'}
                    </button>
                  </div>
                </form>
              ) : (
                <div className="guild-state-card">
                  Join this guild before posting. Public chain data stays
                  visible, but posting is member-gated.
                </div>
              )}

              {state.posts.length > 0 ? (
                <div className="home-feed-list">
                  {state.posts.map((post) => (
                    <PostCard key={postKey(post)} post={post} />
                  ))}
                </div>
              ) : (
                <div className="guild-state-card">
                  No guild posts yet. Members can start the feed from this page.
                </div>
              )}
            </section>
          </>
        ) : null}
      </div>
      <TransactionFeedbackToast result={txResult} onClose={clearTxResult} />
    </OsAppScreen>
  );
}
