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
import {
  COMPOSER_PERSONAL_TARGET,
  useComposerFeedTargets,
} from '@/features/guilds/use-composer-feed-targets';
import { submitPersonalPost } from '@/features/home/submit-personal-post';
import {
  dispatchGuildPostConfirmed,
  submitGuildRootPost,
} from '@/features/scarces/submit-guild-drop-post';
import { isDropComposeDraftReady } from '@/features/scarces/drop-compose-draft';
import {
  usePostAuthorProfiles,
  type PostAuthorProfile,
} from '@/hooks/use-post-author-profiles';
import { useOnSocialWriter } from '@/hooks/use-onsocial-writer';
import { isWalletUserCancellation } from '@/lib/wallet-errors';

interface UsePersonalComposerOptions {
  /** When true, dock pen opens a new personal post. */
  registerPen: boolean;
  /**
   * Fallback whisper when destination menus are unavailable.
   * Kept for call-site compatibility; menus replace the identity line.
   */
  destinationLabel?: string;
  /** Optional author map already loaded by the host feed. */
  authorProfiles?: Record<string, PostAuthorProfile>;
  onConfirmed?: (post: PostRow) => void;
}

/**
 * Shared personal compose controller — same sheet UX as guild / Drop, with
 * Public + joined-guild destination menus on new posts.
 */
export function usePersonalComposer({
  registerPen,
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
  const [targetId, setTargetId] = useState(COMPOSER_PERSONAL_TARGET);

  const reportError = useCallback((message: string) => {
    setError(message);
  }, []);

  const composingPost = Boolean(composer && composer.mode === 'post');
  const {
    feedTargetOptions,
    destination,
    selectedSpace,
    guildLoading,
    resetGuildState,
  } = useComposerFeedTargets({
    active: composingPost,
    accountId,
    targetId,
    onError: reportError,
  });

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
    setTargetId(COMPOSER_PERSONAL_TARGET);
    resetGuildState();
    setComposer({ mode: 'post', target: null });
  }, [resetGuildState]);

  const openReply = useCallback((target: PostRow) => {
    setError(null);
    setTargetId(COMPOSER_PERSONAL_TARGET);
    setComposer({ mode: 'reply', target });
  }, []);

  const openQuote = useCallback((target: PostRow) => {
    setError(null);
    setTargetId(COMPOSER_PERSONAL_TARGET);
    setComposer({ mode: 'quote', target });
  }, []);

  useRegisterComposeAction(registerPen ? openPost : null);

  const submit = useCallback(
    async (payload: ComposerSubmit) => {
      if (!composer || pending) return;
      const { mode, target } = composer;
      if (
        !payload.text.trim() &&
        !(payload.files?.length) &&
        !isDropComposeDraftReady(payload.drop)
      ) {
        return;
      }
      if (mode !== 'post' && !target) return;

      if (!isConnected || !accountId) {
        await connect();
        return;
      }

      setError(null);
      setPending(true);
      try {
        const { client } = await withClient();

        if (mode === 'post' && targetId !== COMPOSER_PERSONAL_TARGET) {
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
            dispatchGuildPostConfirmed({
              groupId: result.groupId,
              post: result.optimisticPost,
            });
            onConfirmed?.(result.optimisticPost);
            setComposer(null);
            setTargetId(COMPOSER_PERSONAL_TARGET);
            resetGuildState();
          }
          return;
        }

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
          setTargetId(COMPOSER_PERSONAL_TARGET);
          resetGuildState();
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
      guildLoading,
      isConnected,
      onConfirmed,
      pending,
      resetGuildState,
      selectedSpace,
      targetId,
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
      destination={composer.mode === 'post' ? destination : undefined}
      feedTargets={
        composer.mode === 'post'
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
      pending={
        pending ||
        (composer.mode === 'post' &&
          targetId !== COMPOSER_PERSONAL_TARGET &&
          guildLoading)
      }
      error={error}
      onClose={() => {
        if (!pending) {
          setComposer(null);
          setTargetId(COMPOSER_PERSONAL_TARGET);
          resetGuildState();
        }
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
