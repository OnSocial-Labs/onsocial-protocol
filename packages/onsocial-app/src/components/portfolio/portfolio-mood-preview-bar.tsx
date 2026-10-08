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
import { useApplyPageMoodTint } from '@/hooks/use-apply-page-mood-tint';
import { useUnlockPremiumMood } from '@/hooks/use-unlock-premium-mood';
import { useAppTransactionFeedback } from '@/contexts/app-transaction-feedback-context';
import { usePortfolioCustomize } from '@/contexts/portfolio-customize-context';
import { usePortfolioFacePreview } from '@/contexts/portfolio-face-preview-context';
import { usePortfolioMoodPreview } from '@/contexts/portfolio-mood-preview-context';
import { DaoProposeConfirmSheet } from '@/features/protocol/dao-propose-confirm-sheet';
import {
  PAGE_MOOD_CATALOG as APP_MOOD_CATALOG,
  PREMIUM_MOOD_PRESETS,
} from '@/lib/moods/presets';
import { txToastError, txToastSuccess } from '@/lib/transaction-toast-copy';
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
  kind: 'mood' | 'ink';
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
    previewTint,
    effectiveMood,
    isPreviewingMood,
    discardMoodPreview,
    commitMoodPreview,
    commitTintPreview,
    requestCloseMoodSheet,
    requestOpenMoodSheet,
    requestDaoStake,
  } = usePortfolioMoodPreview();
  const openCustomize = usePortfolioCustomize()?.openCustomize;
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
  const {
    applyMoodTint,
    isApplying: isApplyingTint,
    error: tintError,
  } = useApplyPageMoodTint(pageAccountId);
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

  const inkPreview = previewTint !== null && previewMoodId === null;
  const isOpen = isPreviewingMood || farewellSnapshot !== null;
  const error = applyError ?? unlockError ?? tintError;
  const isBusy = isApplying || isUnlocking || isApplyingTint;
  const proposeOnly = isDao && isOwner && !isAccountOwner;

  useEffect(() => {
    if (!error) return;
    setTxResult({
      type: 'error',
      msg: inkPreview
        ? txToastError.inkSaveFailed
        : txToastError.moodSaveFailed,
    });
  }, [error, inkPreview, setTxResult]);

  if (
    !isOwner ||
    !isOpen ||
    (!farewellSnapshot && !previewMoodId && !previewTint)
  ) {
    return null;
  }

  const snapshot: MoodPreviewBarSnapshot =
    farewellSnapshot ??
    (inkPreview && previewTint
      ? {
          previewLabel: `Ink · ${Math.round(previewTint.hue)}°`,
          kind: 'ink',
        }
      : {
          previewLabel: effectiveMood.label,
          kind: 'mood',
        });
  const savingInk = snapshot.kind === 'ink';
  const activePreviewId = previewMoodId;
  const unlocked = activePreviewId
    ? isPageMoodUnlocked(
        { moodUnlocks: config.moodUnlocks },
        activePreviewId,
        PAGE_MOOD_CATALOG
      )
    : true;
  const priceSocial = activePreviewId
    ? APP_MOOD_CATALOG[activePreviewId]?.priceSocial
    : undefined;
  const needsUnlock =
    activePreviewId != null && !unlocked && isPremiumMoodId(activePreviewId);

  async function commitInk() {
    if (!previewTint) {
      return;
    }

    const { moodId, hue } = previewTint;
    const applyTxHash = await applyMoodTint(moodId, hue);
    if (applyTxHash === null) {
      return;
    }

    setTxResult({
      type: 'success',
      msg: txToastSuccess.inkSaved,
      explorerHref: nearExplorerTxHref(applyTxHash) ?? null,
    });
    setFarewellSnapshot({
      previewLabel: `Ink · ${Math.round(hue)}°`,
      kind: 'ink',
    });
    dismissTimerRef.current = setTimeout(() => {
      commitTintPreview(moodId, hue);
      setFarewellSnapshot(null);
    }, SAVED_DISMISS_MS);
  }

  async function commitMood() {
    if (!activePreviewId) {
      return;
    }

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
    if (savingInk) {
      void commitInk();
      return;
    }
    if (proposeOnly) {
      setProposeConfirmOpen(true);
      return;
    }
    void commitMood();
  }

  function handleCancel() {
    const reopenCustomize = savingInk;
    setProposeConfirmOpen(false);
    discardMoodPreview();
    window.setTimeout(() => {
      if (reopenCustomize) {
        openCustomize?.();
        return;
      }
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
          <OsSheetActions
            layout="row-compact"
            tone="frosted-primary"
            borderless
          >
            <OsSheetAction
              type="button"
              variant="primary"
              ready={!isBusy}
              pending={isBusy}
              pendingLabel={
                savingInk
                  ? 'Saving…'
                  : needsUnlock
                    ? 'Unlocking…'
                    : isAccountOwner
                      ? 'Saving…'
                      : 'Submitting…'
              }
              disabled={isBusy}
              onClick={handlePrimary}
            >
              {savingInk
                ? 'Save'
                : needsUnlock && priceSocial && isAccountOwner
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
