'use client';

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import { usePathname } from 'next/navigation';
import type { GroupMembershipCurrentRow, PostRow } from '@onsocial/sdk';
import { useAppTransactionFeedback } from '@/contexts/app-transaction-feedback-context';
import { useAppWallet } from '@/contexts/app-wallet-context';
import { normalizeGuildConfig } from '@/features/guilds/guild-config';
import {
  ComposerSheet,
  type ComposerDropDraft,
  type ComposerSubmit,
} from '@/features/guilds/guild-composer-sheet';
import {
  composerGuildSpaces,
  defaultComposerSpace,
  type GuildSpace,
  type GuildViewerAccess,
} from '@/features/guilds/guild-structure';
import { submitPersonalPost } from '@/features/home/submit-personal-post';
import {
  clearDropComposeDraft,
  peekDropComposeDraft,
  subscribeDropComposeDraft,
  takeDropComposeDraft,
  type DropComposeDraft,
} from '@/features/scarces/drop-compose-draft';
import {
  dispatchGuildPostConfirmed,
  submitGuildDropPost,
} from '@/features/scarces/submit-guild-drop-post';
import { useOnSocialWriter } from '@/hooks/use-onsocial-writer';
import { createReadOnlyOnSocialClient } from '@/lib/create-readonly-onsocial-client';
import { fallbackLabel } from '@/lib/profile-display';
import { isWalletUserCancellation } from '@/lib/wallet-errors';

const PERSONAL_TARGET = 'personal';

function draftToComposer(draft: DropComposeDraft): ComposerDropDraft {
  return {
    collectionId: draft.collectionId,
    ...(draft.tokenId ? { tokenId: draft.tokenId } : {}),
    title: draft.title,
    ...(draft.mediaUrl ? { mediaUrl: draft.mediaUrl } : {}),
    ...(draft.mediumKind ? { mediumKind: draft.mediumKind } : {}),
  };
}

function guildIdFromPath(pathname: string | null): string | null {
  if (!pathname) return null;
  const match = pathname.match(/^\/groups\/([^/]+)/);
  if (!match?.[1]) return null;
  try {
    return decodeURIComponent(match[1]).trim() || null;
  } catch {
    return match[1].trim() || null;
  }
}

function accessFromMembership(
  row: GroupMembershipCurrentRow
): GuildViewerAccess {
  return {
    isMember: true,
    canModerate: Boolean(row.canModerate || row.isAdmin || row.isOwner),
    isAdmin: Boolean(row.isAdmin || row.isOwner),
    isOwner: Boolean(row.isOwner),
  };
}

/**
 * Global host for “Post this Drop” — opens the composer with Public or a
 * joined guild as destination. Same collection embed on both paths.
 */
export function DropComposeHost() {
  const pathname = usePathname();
  const { isConnected, connect, accountId } = useAppWallet();
  const { withClient } = useOnSocialWriter();
  const { trackTransaction } = useAppTransactionFeedback();
  const draft = useSyncExternalStore(
    subscribeDropComposeDraft,
    peekDropComposeDraft,
    () => null
  );
  const [openDraft, setOpenDraft] = useState<DropComposeDraft | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [memberships, setMemberships] = useState<GroupMembershipCurrentRow[]>(
    []
  );
  const [targetId, setTargetId] = useState(PERSONAL_TARGET);
  const [guildSpaces, setGuildSpaces] = useState<GuildSpace[]>([]);
  const [guildName, setGuildName] = useState('');
  const [spaceId, setSpaceId] = useState('general');
  const [guildLoading, setGuildLoading] = useState(false);
  const defaultedTargetRef = useRef(false);

  useEffect(() => {
    if (!draft || openDraft) return;
    const next = takeDropComposeDraft();
    if (!next) return;
    setError(null);
    setOpenDraft(next);
    defaultedTargetRef.current = false;
    const pathGuild = guildIdFromPath(pathname);
    setTargetId(pathGuild ?? PERSONAL_TARGET);
    setGuildSpaces([]);
    setGuildName('');
    setSpaceId('general');
  }, [draft, openDraft, pathname]);

  useEffect(() => {
    if (!openDraft || !accountId) {
      setMemberships([]);
      return;
    }
    let cancelled = false;
    const client = createReadOnlyOnSocialClient();
    void client.query.groups
      .membershipsBy(accountId, { limit: 24 })
      .then((page) => {
        if (!cancelled) setMemberships(page.items ?? []);
      })
      .catch(() => {
        if (!cancelled) setMemberships([]);
      });
    return () => {
      cancelled = true;
    };
  }, [openDraft, accountId]);

  useEffect(() => {
    if (!openDraft || targetId === PERSONAL_TARGET) {
      setGuildSpaces([]);
      setGuildName('');
      return;
    }
    const membership = memberships.find((row) => row.groupId === targetId);
    if (!membership) return;

    let cancelled = false;
    setGuildLoading(true);
    void (async () => {
      try {
        const { client } = await withClient();
        const raw = await client.groups.getConfig(targetId);
        if (cancelled) return;
        const access = accessFromMembership(membership);
        if (raw) {
          const config = normalizeGuildConfig(targetId, raw);
          const spaces = composerGuildSpaces(config.structure, access);
          setGuildName(config.name || membership.groupName || targetId);
          setGuildSpaces(spaces);
          const preferred =
            defaultComposerSpace(config.structure, access)?.id ??
            spaces[0]?.id ??
            'general';
          setSpaceId((current) =>
            spaces.some((space) => space.id === current) ? current : preferred
          );
        } else {
          setGuildName(membership.groupName?.trim() || targetId);
          setGuildSpaces([]);
        }
      } catch {
        if (!cancelled) {
          setGuildName(membership.groupName?.trim() || targetId);
          setGuildSpaces([]);
          setError('Could not load that guild’s rooms.');
        }
      } finally {
        if (!cancelled) setGuildLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [openDraft, targetId, memberships, withClient]);

  // Once memberships land, prefer the guild you’re viewing (one-shot).
  useEffect(() => {
    if (!openDraft || defaultedTargetRef.current || memberships.length === 0) {
      return;
    }
    const pathGuild = guildIdFromPath(pathname);
    defaultedTargetRef.current = true;
    if (!pathGuild) return;
    if (!memberships.some((row) => row.groupId === pathGuild)) return;
    setTargetId(pathGuild);
  }, [openDraft, memberships, pathname]);

  const feedTargetOptions = useMemo(() => {
    const options = [{ id: PERSONAL_TARGET, label: 'Public' }];
    for (const row of memberships) {
      const id = row.groupId?.trim();
      if (!id) continue;
      options.push({
        id,
        label: row.groupName?.trim() || id,
      });
    }
    return options;
  }, [memberships]);

  const selectedSpace: GuildSpace | null = useMemo(() => {
    if (targetId === PERSONAL_TARGET || guildSpaces.length === 0) return null;
    return (
      guildSpaces.find((space) => space.id === spaceId) ?? guildSpaces[0] ?? null
    );
  }, [targetId, guildSpaces, spaceId]);

  const handleClose = useCallback(() => {
    if (pending) return;
    setOpenDraft(null);
    clearDropComposeDraft();
    setError(null);
    setTargetId(PERSONAL_TARGET);
  }, [pending]);

  const handleSubmit = useCallback(
    async (payload: ComposerSubmit) => {
      if (pending) return;
      const drop = payload.drop;
      if (!drop?.collectionId && !payload.text.trim()) return;

      if (!isConnected || !accountId) {
        await connect();
        return;
      }

      setError(null);
      setPending(true);
      try {
        const { client } = await withClient();

        if (targetId !== PERSONAL_TARGET) {
          if (!drop?.collectionId) {
            setError('Attach a Drop to post to a guild from here.');
            return;
          }
          if (!selectedSpace) {
            setError(
              guildLoading
                ? 'Loading guild rooms…'
                : 'Choose a room you can post in.'
            );
            return;
          }
          const result = await submitGuildDropPost({
            client,
            accountId,
            groupId: targetId,
            space: selectedSpace,
            text: payload.text,
            drop,
            contentWarning: payload.contentWarning,
            nsfw: payload.nsfw,
            trackTransaction,
          });
          if (result.confirmed && result.optimisticPost) {
            setOpenDraft(null);
            clearDropComposeDraft();
            dispatchGuildPostConfirmed({
              groupId: result.groupId,
              post: result.optimisticPost,
            });
          }
          return;
        }

        const result = await submitPersonalPost({
          client,
          accountId,
          mode: 'post',
          target: null,
          payload,
          trackTransaction,
        });
        if (result.confirmed && result.optimisticPost) {
          setOpenDraft(null);
          clearDropComposeDraft();
          dispatchPersonalPostConfirmed(result.optimisticPost);
        }
      } catch (cause) {
        if (isWalletUserCancellation(cause)) return;
        setError(
          cause instanceof Error ? cause.message : 'Could not publish post.'
        );
      } finally {
        setPending(false);
      }
    },
    [
      accountId,
      connect,
      guildLoading,
      isConnected,
      pending,
      selectedSpace,
      targetId,
      trackTransaction,
      withClient,
    ]
  );

  if (!openDraft) return null;

  const personalLabel = accountId
    ? `@${fallbackLabel(accountId)} · Public`
    : 'Public';

  const destination =
    targetId !== PERSONAL_TARGET && selectedSpace
      ? {
          kind: 'guild' as const,
          name: guildName || targetId,
          channels: guildSpaces.map((space) => ({
            id: space.id,
            title: space.title,
          })),
          selectedChannelId: selectedSpace.id,
          onChannelChange: setSpaceId,
        }
      : {
          kind: 'personal' as const,
          label:
            targetId !== PERSONAL_TARGET && guildLoading
              ? `${guildName || targetId} · Loading…`
              : personalLabel,
        };

  return (
    <ComposerSheet
      open
      mode="post"
      initialDrop={draftToComposer(openDraft)}
      initialText={openDraft.text ?? ''}
      destination={destination}
      feedTargets={
        feedTargetOptions.length > 1
          ? {
              options: feedTargetOptions,
              selectedId: targetId,
              onChange: (id) => {
                setError(null);
                setTargetId(id);
              },
            }
          : undefined
      }
      pending={pending || (targetId !== PERSONAL_TARGET && guildLoading)}
      error={error}
      onClose={handleClose}
      onSubmit={(payload) => void handleSubmit(payload)}
    />
  );
}

const PERSONAL_POST_CONFIRMED = 'onsocial:personal-post-confirmed';

function dispatchPersonalPostConfirmed(post: PostRow) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(
    new CustomEvent(PERSONAL_POST_CONFIRMED, { detail: post })
  );
}

export function subscribePersonalPostConfirmed(
  listener: (post: PostRow) => void
): () => void {
  if (typeof window === 'undefined') return () => undefined;
  const handler = (event: Event) => {
    const detail = (event as CustomEvent<PostRow>).detail;
    if (detail) listener(detail);
  };
  window.addEventListener(PERSONAL_POST_CONFIRMED, handler);
  return () => window.removeEventListener(PERSONAL_POST_CONFIRMED, handler);
}
