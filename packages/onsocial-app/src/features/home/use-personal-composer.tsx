'use client';

import { useCallback, useMemo, useState } from 'react';
import type { PostRow } from '@onsocial/sdk';
import { useAppTransactionFeedback } from '@/contexts/app-transaction-feedback-context';
import { useAppWallet } from '@/contexts/app-wallet-context';
import { useRegisterComposeAction } from '@/contexts/compose-launcher-context';
import {
  ComposerSheet,
  type ComposerMode,
  type ComposerSubmit,
} from '@/features/guilds/guild-composer-sheet';
import { submitPersonalPost } from '@/features/home/submit-personal-post';
import {
  usePostAuthorProfiles,
  type PostAuthorProfile,
} from '@/hooks/use-post-author-profiles';
import { useOnSocialWriter } from '@/hooks/use-onsocial-writer';
import { isWalletUserCancellation } from '@/lib/wallet-errors';

interface UsePersonalComposerOptions {
  /** When true, dock pen opens a new personal post. */
  registerPen: boolean;
  /** Whisper under “New post”, e.g. `@alice.near · Public`. */
  destinationLabel: string;
  /** Optional author map already loaded by the host feed. */
  authorProfiles?: Record<string, PostAuthorProfile>;
  onConfirmed?: (post: PostRow) => void;
}

/**
 * Shared personal compose controller — same sheet UX as guild, personal
 * (or group-aware reply/quote) write path.
 */
export function usePersonalComposer({
  registerPen,
  destinationLabel,
  authorProfiles,
  onConfirmed,
}: UsePersonalComposerOptions) {
  const { isConnected, connect, accountId } = useAppWallet();
  const { withClient } = useOnSocialWriter();
  const { trackTransaction } = useAppTransactionFeedback();
  const [composer, setComposer] = useState<{
    mode: ComposerMode;
    target: PostRow | null;
  } | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const targetAuthorIds = useMemo(
    () => (composer?.target ? [composer.target.accountId] : []),
    [composer?.target]
  );
  const fetchedProfiles = usePostAuthorProfiles(targetAuthorIds);
  const targetAuthorProfile = composer?.target
    ? (authorProfiles?.[composer.target.accountId] ??
      fetchedProfiles[composer.target.accountId])
    : undefined;

  const openPost = useCallback(() => {
    setError(null);
    setComposer({ mode: 'post', target: null });
  }, []);

  const openReply = useCallback((target: PostRow) => {
    setError(null);
    setComposer({ mode: 'reply', target });
  }, []);

  const openQuote = useCallback((target: PostRow) => {
    setError(null);
    setComposer({ mode: 'quote', target });
  }, []);

  useRegisterComposeAction(registerPen ? openPost : null);

  const submit = useCallback(
    async (payload: ComposerSubmit) => {
      if (!composer || pending) return;
      const { mode, target } = composer;
      if (!payload.text.trim() && !(payload.files?.length)) return;
      if (mode !== 'post' && !target) return;

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
          mode,
          target,
          payload,
          trackTransaction,
        });
        if (result.confirmed && result.optimisticPost) {
          onConfirmed?.(result.optimisticPost);
          setComposer(null);
        }
      } catch (cause) {
        if (isWalletUserCancellation(cause)) return;
        setError(
          cause instanceof Error
            ? cause.message
            : mode === 'quote'
              ? 'Could not quote this post.'
              : mode === 'reply'
                ? 'Could not reply to this post.'
                : 'Could not publish post.'
        );
      } finally {
        setPending(false);
      }
    },
    [
      accountId,
      composer,
      connect,
      isConnected,
      onConfirmed,
      pending,
      trackTransaction,
      withClient,
    ]
  );

  const sheet = composer ? (
    <ComposerSheet
      open
      mode={composer.mode}
      target={composer.target}
      targetAuthorProfile={targetAuthorProfile}
      onModeChange={
        composer.target
          ? (mode) =>
              setComposer((current) =>
                current ? { ...current, mode } : current
              )
          : undefined
      }
      destination={
        composer.mode === 'post'
          ? { kind: 'personal', label: destinationLabel }
          : undefined
      }
      pending={pending}
      error={error}
      onClose={() => {
        if (!pending) setComposer(null);
      }}
      onSubmit={(payload) => void submit(payload)}
    />
  ) : null;

  return {
    openPost,
    openReply,
    openQuote,
    sheet,
    isOpen: Boolean(composer),
  };
}
