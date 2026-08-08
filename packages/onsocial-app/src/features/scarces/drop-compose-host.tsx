'use client';

import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import type { PostRow } from '@onsocial/sdk';
import { useAppTransactionFeedback } from '@/contexts/app-transaction-feedback-context';
import { useAppWallet } from '@/contexts/app-wallet-context';
import {
  ComposerSheet,
  type ComposerDropDraft,
  type ComposerSubmit,
} from '@/features/guilds/guild-composer-sheet';
import { submitPersonalPost } from '@/features/home/submit-personal-post';
import {
  clearDropComposeDraft,
  peekDropComposeDraft,
  subscribeDropComposeDraft,
  takeDropComposeDraft,
  type DropComposeDraft,
} from '@/features/scarces/drop-compose-draft';
import { useOnSocialWriter } from '@/hooks/use-onsocial-writer';
import { fallbackLabel } from '@/lib/profile-display';
import { isWalletUserCancellation } from '@/lib/wallet-errors';

function draftToComposer(draft: DropComposeDraft): ComposerDropDraft {
  return {
    collectionId: draft.collectionId,
    ...(draft.tokenId ? { tokenId: draft.tokenId } : {}),
    title: draft.title,
    ...(draft.mediaUrl ? { mediaUrl: draft.mediaUrl } : {}),
    ...(draft.mediumKind ? { mediumKind: draft.mediumKind } : {}),
  };
}

/**
 * Global host for “Post this Drop” — opens the personal composer when any
 * surface queues a draft via `requestDropCompose`.
 */
export function DropComposeHost() {
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

  useEffect(() => {
    if (!draft || openDraft) return;
    const next = takeDropComposeDraft();
    if (next) {
      setError(null);
      setOpenDraft(next);
    }
  }, [draft, openDraft]);

  const handleClose = useCallback(() => {
    if (pending) return;
    setOpenDraft(null);
    clearDropComposeDraft();
    setError(null);
  }, [pending]);

  const handleSubmit = useCallback(
    async (payload: ComposerSubmit) => {
      if (pending) return;
      if (!payload.drop?.collectionId && !payload.text.trim()) return;

      if (!isConnected || !accountId) {
        await connect();
        return;
      }

      setError(null);
      setPending(true);
      try {
        const { client } = await withClient();
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
    [accountId, connect, isConnected, pending, trackTransaction, withClient]
  );

  if (!openDraft) return null;

  const destinationLabel = accountId
    ? `@${fallbackLabel(accountId)} · Public`
    : 'Public';

  return (
    <ComposerSheet
      open
      mode="post"
      initialDrop={draftToComposer(openDraft)}
      initialText={openDraft.text ?? ''}
      destination={{ kind: 'personal', label: destinationLabel }}
      pending={pending}
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
