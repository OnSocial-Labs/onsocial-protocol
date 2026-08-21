'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { PostRow } from '@onsocial/sdk';
import { useAppTransactionFeedback } from '@/contexts/app-transaction-feedback-context';
import { useAppWallet } from '@/contexts/app-wallet-context';
import { useRegisterComposeAction } from '@/contexts/compose-launcher-context';
import { usePortfolioMoodPreviewOptional } from '@/contexts/portfolio-mood-preview-context';
import {
  ComposerSheet,
  type ComposerMode,
  type ComposerSubmit,
} from '@/features/guilds/guild-composer-sheet';
import {
  COMPOSER_AUTHOR_DAO,
  COMPOSER_AUTHOR_ME,
  useComposerDaoAuthors,
  type ComposerAuthorMode,
} from '@/features/guilds/use-composer-dao-authors';
import {
  COMPOSER_PERSONAL_TARGET,
  useComposerFeedTargets,
} from '@/features/guilds/use-composer-feed-targets';
import { DaoProposeConfirmSheet } from '@/features/protocol/dao-propose-confirm-sheet';
import { submitDaoPostProposal } from '@/features/home/submit-dao-post-proposal';
import { submitPersonalPost, submitPersonalRepost } from '@/features/home/submit-personal-post';
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
import { daoPath } from '@/lib/app-routes';
import { scarceNestZIndex } from '@/features/scarces/scarce-overlay-z';
import { isWalletUserCancellation } from '@/lib/wallet-errors';

const COMPOSER_CONFIRM_Z = scarceNestZIndex(58);

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
 * Public + joined-guild destination menus on new posts, and As Me / DAO
 * for council proposers.
 */
export function usePersonalComposer({
  registerPen,
  authorProfiles,
  onConfirmed,
}: UsePersonalComposerOptions) {
  const router = useRouter();
  const { isConnected, connect, accountId, getSigningWallet } = useAppWallet();
  const { withClient } = useOnSocialWriter();
  const { trackTransaction } = useAppTransactionFeedback();
  const moodPreview = usePortfolioMoodPreviewOptional();
  const [composer, setComposer] = useState<{
    mode: ComposerMode;
    target: PostRow | null;
  } | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [targetId, setTargetId] = useState(COMPOSER_PERSONAL_TARGET);
  const [authorMode, setAuthorMode] =
    useState<ComposerAuthorMode>(COMPOSER_AUTHOR_ME);
  const [selectedDaoId, setSelectedDaoId] = useState<string | null>(null);
  const [proposeConfirmOpen, setProposeConfirmOpen] = useState(false);
  const [pendingDaoPayload, setPendingDaoPayload] =
    useState<ComposerSubmit | null>(null);

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

  const {
    loading: daoAuthorsLoading,
    eligible: daoAuthors,
    eligibilityByDao,
    hasEligible: hasEligibleDaos,
  } = useComposerDaoAuthors({
    active: composingPost && Boolean(accountId),
    accountId,
  });

  useEffect(() => {
    if (!hasEligibleDaos && authorMode === COMPOSER_AUTHOR_DAO) {
      setAuthorMode(COMPOSER_AUTHOR_ME);
      setSelectedDaoId(null);
    }
  }, [authorMode, hasEligibleDaos]);

  useEffect(() => {
    if (authorMode !== COMPOSER_AUTHOR_DAO) return;
    if (
      selectedDaoId &&
      daoAuthors.some((row) => row.daoAccountId === selectedDaoId)
    ) {
      return;
    }
    setSelectedDaoId(daoAuthors[0]?.daoAccountId ?? null);
  }, [authorMode, daoAuthors, selectedDaoId]);

  useEffect(() => {
    if (authorMode === COMPOSER_AUTHOR_DAO) {
      setTargetId(COMPOSER_PERSONAL_TARGET);
    }
  }, [authorMode]);

  const targetAuthorIds = useMemo(
    () => (composer?.target ? [composer.target.accountId] : []),
    [composer?.target]
  );
  const fetchedProfiles = usePostAuthorProfiles(targetAuthorIds);
  const targetAuthorProfile = composer?.target
    ? (authorProfiles?.[composer.target.accountId] ??
      fetchedProfiles[composer.target.accountId])
    : undefined;

  const resetComposerState = useCallback(() => {
    setComposer(null);
    setTargetId(COMPOSER_PERSONAL_TARGET);
    setAuthorMode(COMPOSER_AUTHOR_ME);
    setSelectedDaoId(null);
    setProposeConfirmOpen(false);
    setPendingDaoPayload(null);
    resetGuildState();
  }, [resetGuildState]);

  const openPost = useCallback(() => {
    setError(null);
    setTargetId(COMPOSER_PERSONAL_TARGET);
    setAuthorMode(COMPOSER_AUTHOR_ME);
    setSelectedDaoId(null);
    setProposeConfirmOpen(false);
    setPendingDaoPayload(null);
    resetGuildState();
    setComposer({ mode: 'post', target: null });
  }, [resetGuildState]);

  const openReply = useCallback((target: PostRow) => {
    setError(null);
    setTargetId(COMPOSER_PERSONAL_TARGET);
    setAuthorMode(COMPOSER_AUTHOR_ME);
    setSelectedDaoId(null);
    setComposer({ mode: 'reply', target });
  }, []);

  const openQuote = useCallback((target: PostRow) => {
    setError(null);
    setTargetId(COMPOSER_PERSONAL_TARGET);
    setAuthorMode(COMPOSER_AUTHOR_ME);
    setSelectedDaoId(null);
    setComposer({ mode: 'quote', target });
  }, []);

  const openRepost = useCallback(
    async (target: PostRow) => {
      if (!accountId) {
        if (!isConnected) await connect();
        return;
      }
      setError(null);
      setPending(true);
      try {
        const { client } = await withClient();
        const result = await submitPersonalRepost({
          client,
          accountId,
          target,
          trackTransaction,
        });
        if (result.confirmed && result.optimisticPost) {
          onConfirmed?.(result.optimisticPost);
        }
      } catch (err) {
        if (!isWalletUserCancellation(err)) {
          setError(
            err instanceof Error ? err.message : 'Could not repost.'
          );
        }
      } finally {
        setPending(false);
      }
    },
    [
      accountId,
      connect,
      isConnected,
      onConfirmed,
      trackTransaction,
      withClient,
    ]
  );

  useRegisterComposeAction(registerPen ? openPost : null);

  const submitDaoProposal = useCallback(async () => {
    if (!pendingDaoPayload || !selectedDaoId || pending) return;
    const daoLabel =
      daoAuthors.find((row) => row.daoAccountId === selectedDaoId)?.label ??
      selectedDaoId;
    setPending(true);
    setError(null);
    try {
      const { client } = await withClient();
      const { accountId: signerId, wallet } = await getSigningWallet();
      const result = await submitDaoPostProposal({
        client,
        daoAccountId: selectedDaoId,
        daoLabel,
        accountId: signerId,
        wallet,
        payload: pendingDaoPayload,
        trackTransaction,
      });
      if (result.confirmed) {
        setProposeConfirmOpen(false);
        setPendingDaoPayload(null);
        resetComposerState();
      }
    } catch (cause) {
      if (isWalletUserCancellation(cause)) return;
      setError(
        cause instanceof Error
          ? cause.message
          : 'Could not propose DAO post.'
      );
    } finally {
      setPending(false);
    }
  }, [
    daoAuthors,
    getSigningWallet,
    pending,
    pendingDaoPayload,
    resetComposerState,
    selectedDaoId,
    trackTransaction,
    withClient,
  ]);

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

      if (mode === 'post' && authorMode === COMPOSER_AUTHOR_DAO) {
        if (!selectedDaoId) {
          setError('Choose a DAO to propose as.');
          return;
        }
        setError(null);
        setPendingDaoPayload(payload);
        setProposeConfirmOpen(true);
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
            resetComposerState();
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
          resetComposerState();
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
      authorMode,
      composer,
      connect,
      guildLoading,
      isConnected,
      onConfirmed,
      pending,
      resetComposerState,
      selectedDaoId,
      selectedSpace,
      targetId,
      trackTransaction,
      withClient,
    ]
  );

  const selectedDaoEligibility =
    selectedDaoId != null ? (eligibilityByDao[selectedDaoId] ?? null) : null;

  const sheet = composer ? (
    <>
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
          composer.mode === 'post' && authorMode !== COMPOSER_AUTHOR_DAO
            ? destination
            : undefined
        }
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
        authorTargets={
          composer.mode === 'post' && hasEligibleDaos
            ? {
                mode: authorMode,
                onModeChange: (mode) => {
                  setError(null);
                  setAuthorMode(mode);
                  if (mode === COMPOSER_AUTHOR_ME) {
                    setSelectedDaoId(null);
                  }
                },
                daoOptions: daoAuthors.map((row) => ({
                  id: row.daoAccountId,
                  label: row.label,
                })),
                selectedDaoId,
                onDaoChange: (daoAccountId) => {
                  setError(null);
                  setSelectedDaoId(daoAccountId);
                },
                daoLoading: daoAuthorsLoading,
              }
            : undefined
        }
        pending={
          pending ||
          (composer.mode === 'post' &&
            authorMode !== COMPOSER_AUTHOR_DAO &&
            targetId !== COMPOSER_PERSONAL_TARGET &&
            guildLoading)
        }
        error={error}
        onClose={() => {
          if (!pending) {
            resetComposerState();
          }
        }}
        onSubmit={(payload) => void submit(payload)}
      />
      <DaoProposeConfirmSheet
        open={proposeConfirmOpen}
        title="Propose post as DAO?"
        body="Council reviews a Call that publishes this post under the DAO account."
        eligibility={selectedDaoEligibility}
        eligibilityLoading={
          Boolean(selectedDaoId) && !selectedDaoEligibility && daoAuthorsLoading
        }
        pending={pending}
        proposeLabel="Propose"
        zIndex={COMPOSER_CONFIRM_Z}
        onDiscard={() => {
          setProposeConfirmOpen(false);
          setPendingDaoPayload(null);
        }}
        onPropose={() => {
          void submitDaoProposal();
        }}
        onStake={() => {
          setProposeConfirmOpen(false);
          if (moodPreview?.requestDaoStake) {
            moodPreview.requestDaoStake();
            return;
          }
          if (selectedDaoId) {
            router.push(daoPath(selectedDaoId));
          }
        }}
      />
    </>
  ) : null;

  return {
    openPost,
    openReply,
    openQuote,
    openRepost,
    sheet,
    isOpen: Boolean(composer),
  };
}
