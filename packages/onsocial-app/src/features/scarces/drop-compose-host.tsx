'use client';

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import { usePathname } from 'next/navigation';
import type { PostRow } from '@onsocial/sdk';
import { useAppTransactionFeedback } from '@/contexts/app-transaction-feedback-context';
import { useAppWallet } from '@/contexts/app-wallet-context';
import {
  ComposerSheet,
  type ComposerDropDraft,
  type ComposerSubmit,
} from '@/features/guilds/guild-composer-sheet';
import {
  COMPOSER_PERSONAL_TARGET,
  useComposerFeedTargets,
} from '@/features/guilds/use-composer-feed-targets';
import { submitPersonalPost } from '@/features/home/submit-personal-post';
import {
  clearDropComposeDraft,
  isDropComposeDraftReady,
  peekDropComposeDraft,
  subscribeDropComposeDraft,
  takeDropComposeDraft,
  type DropComposeDraft,
} from '@/features/scarces/drop-compose-draft';
import {
  dispatchGuildPostConfirmed,
  submitGuildRootPost,
} from '@/features/scarces/submit-guild-drop-post';
import { useOnSocialWriter } from '@/hooks/use-onsocial-writer';
import { isWalletUserCancellation } from '@/lib/wallet-errors';

function draftToComposer(draft: DropComposeDraft): ComposerDropDraft {
  return {
    ...(draft.collectionId ? { collectionId: draft.collectionId } : {}),
    ...(draft.tokenId ? { tokenId: draft.tokenId } : {}),
    title: draft.title,
    ...(draft.mediaUrl ? { mediaUrl: draft.mediaUrl } : {}),
    ...(draft.mediumKind ? { mediumKind: draft.mediumKind } : {}),
    ...(draft.sourcePostPath ? { sourcePostPath: draft.sourcePostPath } : {}),
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

/**
 * Global host for “Post this Drop” / resale announce — opens the composer with
 * Public or a joined guild as destination. Collection or token embed on both.
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
  const [targetId, setTargetId] = useState(COMPOSER_PERSONAL_TARGET);
  const defaultedTargetRef = useRef(false);

  const reportError = useCallback((message: string) => {
    setError(message);
  }, []);

  const {
    memberships,
    feedTargetOptions,
    destination,
    selectedSpace,
    guildLoading,
    resetGuildState,
  } = useComposerFeedTargets({
    active: Boolean(openDraft),
    accountId,
    targetId,
    onError: reportError,
  });

  useEffect(() => {
    if (!draft || openDraft) return;
    const next = takeDropComposeDraft();
    if (!next) return;
    setError(null);
    setOpenDraft(next);
    defaultedTargetRef.current = false;
    const pathGuild = guildIdFromPath(pathname);
    setTargetId(pathGuild ?? COMPOSER_PERSONAL_TARGET);
    resetGuildState();
  }, [draft, openDraft, pathname, resetGuildState]);

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

  const handleClose = useCallback(() => {
    if (pending) return;
    setOpenDraft(null);
    clearDropComposeDraft();
    setError(null);
    setTargetId(COMPOSER_PERSONAL_TARGET);
    resetGuildState();
  }, [pending, resetGuildState]);

  const handleSubmit = useCallback(
    async (payload: ComposerSubmit) => {
      if (pending) return;
      const drop = payload.drop;
      if (!isDropComposeDraftReady(drop) && !payload.text.trim()) return;

      if (!isConnected || !accountId) {
        await connect();
        return;
      }

      setError(null);
      setPending(true);
      try {
        const { client } = await withClient();

        if (targetId !== COMPOSER_PERSONAL_TARGET) {
          if (!isDropComposeDraftReady(drop)) {
            setError('Attach a Drop to post to a guild from here.');
            return;
          }
          if (guildLoading) {
            setError('Loading guild rooms…');
            return;
          }
          if (!selectedSpace) {
            setError('Choose a room you can post in.');
            return;
          }
          const result = await submitGuildRootPost({
            client,
            accountId,
            groupId: targetId,
            space: selectedSpace,
            payload,
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

  return (
    <ComposerSheet
      open
      mode="post"
      initialDrop={draftToComposer(openDraft)}
      initialText={openDraft.text ?? ''}
      destination={destination}
      feedTargets={{
        options: feedTargetOptions,
        selectedId: targetId,
        onChange: (id) => {
          setError(null);
          setTargetId(id);
        },
      }}
      pending={
        pending ||
        (targetId !== COMPOSER_PERSONAL_TARGET && guildLoading)
      }
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

const PERSONAL_REPLY_CONFIRMED = 'onsocial:personal-reply-confirmed';

export type PersonalReplyConfirmedDetail = {
  parent: PostRow;
  reply: PostRow;
};

function dispatchPersonalReplyConfirmed(detail: PersonalReplyConfirmedDetail) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(
    new CustomEvent(PERSONAL_REPLY_CONFIRMED, { detail })
  );
}

export function subscribePersonalReplyConfirmed(
  listener: (detail: PersonalReplyConfirmedDetail) => void
): () => void {
  if (typeof window === 'undefined') return () => undefined;
  const handler = (event: Event) => {
    const detail = (event as CustomEvent<PersonalReplyConfirmedDetail>).detail;
    if (detail?.parent) listener(detail);
  };
  window.addEventListener(PERSONAL_REPLY_CONFIRMED, handler);
  return () => window.removeEventListener(PERSONAL_REPLY_CONFIRMED, handler);
}

export { dispatchPersonalReplyConfirmed };
