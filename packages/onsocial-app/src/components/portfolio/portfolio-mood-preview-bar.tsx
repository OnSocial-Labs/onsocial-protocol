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
  osSheetActionExpandedClassName,
  osSheetFloatingPanelClassName,
  osSheetFloatingPanelCopyClassName,
  osSheetFloatingPanelErrorClassName,
  osSheetFloatingPanelMetaClassName,
} from '@onsocial/ui';
import { useApplyMood } from '@/hooks/use-apply-mood';
import { useUnlockPremiumMood } from '@/hooks/use-unlock-premium-mood';
import { usePortfolioFacePreview } from '@/contexts/portfolio-face-preview-context';
import { usePortfolioMoodPreview } from '@/contexts/portfolio-mood-preview-context';
import {
  PAGE_MOOD_CATALOG as APP_MOOD_CATALOG,
  PREMIUM_MOOD_PRESETS,
} from '@/lib/moods/presets';
import type { PublicPageConfig } from '@/lib/page-data';

const SAVED_DISMISS_MS = 900;

interface PortfolioMoodPreviewBarProps {
  pageAccountId: string;
  config: PublicPageConfig;
}

interface MoodPreviewBarSnapshot {
  previewLabel: string;
  savedLabel: string;
}

function isPremiumMoodId(moodId: PageMoodId): moodId is PremiumPageMoodId {
  return moodId in PREMIUM_MOOD_PRESETS;
}

export function PortfolioMoodPreviewBar({
  pageAccountId,
  config,
}: PortfolioMoodPreviewBarProps) {
  const {
    committedMood,
    previewMoodId,
    effectiveMood,
    isPreviewingMood,
    discardMoodPreview,
    requestCloseMoodSheet,
  } = usePortfolioMoodPreview();
  const { isPreviewing: isPreviewingFace } = usePortfolioFacePreview();
  const { applyMood, isApplying, isOwner, error: applyError } =
    useApplyMood(pageAccountId);
  const {
    unlockMood,
    isUnlocking,
    error: unlockError,
  } = useUnlockPremiumMood(pageAccountId);
  const [saved, setSaved] = useState(false);
  const [farewellSnapshot, setFarewellSnapshot] =
    useState<MoodPreviewBarSnapshot | null>(null);
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
  const isBusy = isApplying || isUnlocking || saved;

  if (!isOwner || !isOpen || (!farewellSnapshot && !previewMoodId)) {
    return null;
  }

  const snapshot = farewellSnapshot ?? {
    previewLabel: effectiveMood.label,
    savedLabel: committedMood.label,
  };
  const activePreviewId = previewMoodId!;
  const unlocked = isPageMoodUnlocked(
    { moodUnlocks: config.moodUnlocks },
    activePreviewId,
    PAGE_MOOD_CATALOG
  );
  const priceSocial = APP_MOOD_CATALOG[activePreviewId]?.priceSocial;
  const needsUnlock = !unlocked && isPremiumMoodId(activePreviewId);

  async function handleSave() {
    if (needsUnlock) {
      const didUnlock = await unlockMood(activePreviewId);
      if (!didUnlock) {
        return;
      }
    }

    const didApply = await applyMood(activePreviewId);
    if (!didApply) {
      return;
    }

    setFarewellSnapshot(snapshot);
    setSaved(true);
    dismissTimerRef.current = setTimeout(() => {
      discardMoodPreview();
      setSaved(false);
      setFarewellSnapshot(null);
      requestCloseMoodSheet();
    }, SAVED_DISMISS_MS);
  }

  return (
    <div
      className={`${osFloatingPanelClassName} ${osSheetFloatingPanelClassName} portfolio-face-preview-bar portfolio-mood-preview-bar portfolio-face-preview-bar--enter${isPreviewingFace ? ' is-stacked' : ''}`}
      role="status"
    >
      <p className={osSheetFloatingPanelCopyClassName}>
        {saved ? (
          <>
            <strong>{snapshot.previewLabel}</strong> saved.
          </>
        ) : (
          <>
            Previewing mood <strong>{snapshot.previewLabel}</strong>
            <span className={osSheetFloatingPanelMetaClassName}>
              {' '}
              · saved as {snapshot.savedLabel}
            </span>
          </>
        )}
      </p>
      <OsSheetActions layout="row-compact" tone="frosted-primary" borderless>
        {!isBusy ? (
          <OsSheetAction
            type="button"
            variant="danger"
            onClick={discardMoodPreview}
          >
            Discard
          </OsSheetAction>
        ) : null}
        <OsSheetAction
          type="button"
          variant="primary"
          ready={!saved}
          succeeded={saved}
          succeededLabel="Saved"
          pending={isApplying || isUnlocking}
          pendingLabel={needsUnlock ? 'Unlocking…' : 'Saving…'}
          disabled={isBusy}
          className={isBusy ? osSheetActionExpandedClassName : undefined}
          onClick={() => void handleSave()}
        >
          {needsUnlock && priceSocial
            ? `Unlock · ${priceSocial} SOCIAL`
            : 'Save mood'}
        </OsSheetAction>
      </OsSheetActions>

      {error ? (
        <p className={osSheetFloatingPanelErrorClassName}>{error}</p>
      ) : null}
    </div>
  );
}
