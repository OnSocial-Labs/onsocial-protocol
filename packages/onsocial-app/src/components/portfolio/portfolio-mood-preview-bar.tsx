'use client';

import { useEffect, useRef, useState } from 'react';
import {
  isPageMoodUnlocked,
  PAGE_MOOD_CATALOG,
  type PageMoodId,
  type PremiumPageMoodId,
} from '@onsocial/sdk';
import {
  OsSheetAction,
  OsSheetActions,
  osFloatingPanelClassName,
  osSheetFloatingPanelClassName,
} from '@onsocial/ui';
import { useApplyMood } from '@/hooks/use-apply-mood';
import { useUnlockPremiumMood } from '@/hooks/use-unlock-premium-mood';
import { useAppTransactionFeedback } from '@/contexts/app-transaction-feedback-context';
import { usePortfolioFacePreview } from '@/contexts/portfolio-face-preview-context';
import { usePortfolioMoodPreview } from '@/contexts/portfolio-mood-preview-context';
import { DaoProposeConfirmSheet } from '@/features/protocol/dao-propose-confirm-sheet';
import {
  PAGE_MOOD_CATALOG as APP_MOOD_CATALOG,
  PREMIUM_MOOD_PRESETS,
} from '@/lib/moods/presets';
import {
  txToastError,
  txToastSuccess,
} from '@/lib/transaction-toast-copy';
import { nearExplorerTxHref } from '@/lib/app-config';
import type { PublicPageConfig } from '@/lib/page-data';

const SAVED_DISMISS_MS = 280;

interface PortfolioMoodPreviewBarProps {
  pageAccountId: string;
  config: PublicPageConfig;
  /** DAO face — council can propose mood (not instant owner write). */
  isDao?: boolean;
  /** Open stake sheet when confirm hug says stake to propose. */
  onRequestStake?: () => void;
}

interface MoodPreviewBarSnapshot {
  previewLabel: string;
}

function isPremiumMoodId(moodId: PageMoodId): moodId is PremiumPageMoodId {
  return moodId in PREMIUM_MOOD_PRESETS;
}

export function PortfolioMoodPreviewBar({
  pageAccountId,
  config,
  isDao = false,
  onRequestStake,
}: PortfolioMoodPreviewBarProps) {
  const {
    previewMoodId,
    effectiveMood,
    isPreviewingMood,
    discardMoodPreview,
    commitMoodPreview,
    requestCloseMoodSheet,
    requestOpenMoodSheet,
    requestDaoStake,
  } = usePortfolioMoodPreview();
  const openStake = onRequestStake ?? requestDaoStake;
  const { isPreviewing: isPreviewingFace } = usePortfolioFacePreview();
  const {
    applyMood,
    isApplying,
    isOwner,
    isAccountOwner,
    error: applyError,
    eligibility,
    eligibilityLoading,
  } = useApplyMood(pageAccountId, { isDao });
  const {
    unlockMood,
    isUnlocking,
    error: unlockError,
  } = useUnlockPremiumMood(pageAccountId);
  const { setTxResult } = useAppTransactionFeedback();
  const [farewellSnapshot, setFarewellSnapshot] =
    useState<MoodPreviewBarSnapshot | null>(null);
  const [proposeConfirmOpen, setProposeConfirmOpen] = useState(false);
  const dismissTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (dismissTimerRef.current) {
        clearTimeout(dismissTimerRef.current);
      }
    },
    []
  );

  const isOpen = isPreviewingMood || farewellSnapshot !== null;
  const error = applyError ?? unlockError;
  const isBusy = isApplying || isUnlocking;
  const proposeOnly = isDao && isOwner && !isAccountOwner;

  useEffect(() => {
    if (!error) return;
    setTxResult({ type: 'error', msg: txToastError.moodSaveFailed });
  }, [error, setTxResult]);

  if (!isOwner || !isOpen || (!farewellSnapshot && !previewMoodId)) {
    return null;
  }

  const snapshot = farewellSnapshot ?? {
    previewLabel: effectiveMood.label,
  };
  const activePreviewId = previewMoodId!;
  const unlocked = isPageMoodUnlocked(
    { moodUnlocks: config.moodUnlocks },
    activePreviewId,
    PAGE_MOOD_CATALOG
  );
  const priceSocial = APP_MOOD_CATALOG[activePreviewId]?.priceSocial;
  const needsUnlock = !unlocked && isPremiumMoodId(activePreviewId);

  async function commitMood() {
    let explorerHref: string | null = null;

    if (needsUnlock) {
      if (!isAccountOwner) {
        setTxResult({
          type: 'error',
          msg: 'Premium mood unlocks for DAOs are not available yet.',
        });
        return;
      }
      const unlockTxHash = await unlockMood(activePreviewId);
      if (unlockTxHash === null) {
        return;
      }
      explorerHref = nearExplorerTxHref(unlockTxHash) ?? explorerHref;
    }

    const applyTxHash = await applyMood(activePreviewId);
    if (applyTxHash === null) {
      return;
    }
    explorerHref = nearExplorerTxHref(applyTxHash) ?? explorerHref;

    if (!isAccountOwner) {
      discardMoodPreview();
      requestCloseMoodSheet();
      return;
    }

    setTxResult({
      type: 'success',
      msg: txToastSuccess.moodSaved,
      explorerHref,
    });
    setFarewellSnapshot(snapshot);
    dismissTimerRef.current = setTimeout(() => {
      commitMoodPreview(activePreviewId);
      setFarewellSnapshot(null);
      requestCloseMoodSheet();
    }, SAVED_DISMISS_MS);
  }

  function handlePrimary() {
    if (proposeOnly) {
      setProposeConfirmOpen(true);
      return;
    }
    void commitMood();
  }

  function handleCancel() {
    setProposeConfirmOpen(false);
    discardMoodPreview();
    window.setTimeout(() => {
      requestOpenMoodSheet();
    }, 0);
  }

  return (
    <>
      <div
        className={`${osFloatingPanelClassName} ${osSheetFloatingPanelClassName} portfolio-face-preview-bar portfolio-mood-preview-bar portfolio-face-preview-bar--enter${isPreviewingFace ? ' is-stacked' : ''}`}
        role="status"
      >
        <p className="portfolio-face-preview-bar-label">
          <strong>{snapshot.previewLabel}</strong>
        </p>
        <div className="os-commit-actions">
          {!isBusy ? (
            <button
              type="button"
              className="os-commit-cancel"
              onClick={handleCancel}
            >
              Cancel
            </button>
          ) : null}
          <OsSheetActions layout="row-compact" tone="frosted-primary" borderless>
            <OsSheetAction
              type="button"
              variant="primary"
              ready={!isBusy}
              pending={isApplying || isUnlocking}
              pendingLabel={
                needsUnlock
                  ? 'Unlocking…'
                  : isAccountOwner
                    ? 'Saving…'
                    : 'Submitting…'
              }
              disabled={isBusy}
              onClick={handlePrimary}
            >
              {needsUnlock && priceSocial && isAccountOwner
                ? `Unlock · ${priceSocial}`
                : isAccountOwner
                  ? 'Save'
                  : 'Propose mood'}
            </OsSheetAction>
          </OsSheetActions>
        </div>
      </div>

      {proposeOnly ? (
        <DaoProposeConfirmSheet
          open={proposeConfirmOpen}
          title="Propose mood?"
          body={`Submit a proposal to set this DAO’s mood to ${snapshot.previewLabel}.`}
          eligibility={eligibility}
          eligibilityLoading={eligibilityLoading}
          pending={isApplying}
          proposeLabel="Propose"
          onDiscard={() => setProposeConfirmOpen(false)}
          onPropose={() => {
            setProposeConfirmOpen(false);
            void commitMood();
          }}
          onStake={() => {
            setProposeConfirmOpen(false);
            openStake();
          }}
        />
      ) : null}
    </>
  );
}
