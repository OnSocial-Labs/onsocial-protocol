'use client';

import { useEffect, useRef, useState } from 'react';
import {
  OsSheetAction,
  OsSheetActions,
  osFloatingPanelClassName,
  osSheetFloatingPanelClassName,
  osSheetFloatingPanelMetaClassName,
} from '@onsocial/ui';
import { useApplyPageFace } from '@/hooks/use-apply-page-face';
import { useAppTransactionFeedback } from '@/contexts/app-transaction-feedback-context';
import { usePortfolioFacePreview } from '@/contexts/portfolio-face-preview-context';
import { usePortfolioCustomize } from '@/contexts/portfolio-customize-context';
import {
  txToastError,
  txToastSuccess,
} from '@/lib/transaction-toast-copy';
import { nearExplorerTxHref } from '@/lib/app-config';
import type {
  PageAvatarMode,
  PageHeroSource,
  PublicPageConfig,
} from '@/lib/page-data';

const SAVED_DISMISS_MS = 280;

const AVATAR_LABELS: Record<PageAvatarMode, string> = {
  standard: 'Card',
  cover: 'Cover',
};

const HERO_LABELS: Record<PageHeroSource, string> = {
  banner: 'Banner',
  avatar: 'Avatar',
  none: 'Minimal',
};

interface PortfolioFacePreviewBarProps {
  pageAccountId: string;
  config: PublicPageConfig;
}

interface PreviewBarSnapshot {
  previewAvatarMode: PageAvatarMode;
  previewHeroSource: PageHeroSource;
  isPreviewingLayout: boolean;
  isPreviewingHeroSource: boolean;
  committedAvatarMode: PageAvatarMode;
  committedHeroSource: PageHeroSource;
}

function previewSummary(input: {
  previewAvatarMode: PageAvatarMode;
  previewHeroSource: PageHeroSource;
  isPreviewingLayout: boolean;
  isPreviewingHeroSource: boolean;
}): string {
  const parts: string[] = [];

  if (input.isPreviewingLayout) {
    parts.push(AVATAR_LABELS[input.previewAvatarMode]);
  }

  if (input.isPreviewingHeroSource) {
    parts.push(HERO_LABELS[input.previewHeroSource]);
  }

  return parts.join(' · ');
}

function savedSummary(input: {
  committedAvatarMode: PageAvatarMode;
  committedHeroSource: PageHeroSource;
  includeHero: boolean;
}): string {
  const parts: string[] = [AVATAR_LABELS[input.committedAvatarMode]];

  if (input.includeHero && input.committedAvatarMode !== 'cover') {
    parts.push(HERO_LABELS[input.committedHeroSource]);
  }

  return parts.join(' · ');
}

export function PortfolioFacePreviewBar({
  pageAccountId,
  config,
}: PortfolioFacePreviewBarProps) {
  const {
    committedAvatarMode,
    committedHeroSource,
    previewAvatarMode,
    previewHeroSource,
    isPreviewing,
    isPreviewingLayout,
    isPreviewingHeroSource,
    discardPreview,
  } = usePortfolioFacePreview();
  const { applyFacePatch, isApplying, isOwner, error } = useApplyPageFace(
    pageAccountId,
    config
  );
  const customize = usePortfolioCustomize();
  const { setTxResult } = useAppTransactionFeedback();
  const [farewellSnapshot, setFarewellSnapshot] =
    useState<PreviewBarSnapshot | null>(null);
  const dismissTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (dismissTimerRef.current) {
        clearTimeout(dismissTimerRef.current);
      }
    },
    []
  );

  const isOpen = isPreviewing || farewellSnapshot !== null;

  useEffect(() => {
    if (!error) return;
    setTxResult({ type: 'error', msg: txToastError.pageLookSaveFailed });
  }, [error, setTxResult]);

  if (
    !isOwner ||
    !isOpen ||
    (!farewellSnapshot &&
      (previewAvatarMode == null || previewHeroSource == null))
  ) {
    return null;
  }

  const snapshot = farewellSnapshot ?? {
    previewAvatarMode: previewAvatarMode!,
    previewHeroSource: previewHeroSource!,
    isPreviewingLayout,
    isPreviewingHeroSource,
    committedAvatarMode,
    committedHeroSource,
  };

  const previewLabel = previewSummary(snapshot);
  const savedLabel = savedSummary({
    committedAvatarMode: snapshot.committedAvatarMode,
    committedHeroSource: snapshot.committedHeroSource,
    includeHero: snapshot.isPreviewingHeroSource,
  });
  const showSavedMeta = savedLabel !== previewLabel;

  function handleCancel() {
    discardPreview();
    window.setTimeout(() => {
      customize?.openCustomize();
    }, 0);
  }

  async function handleSave() {
    const patch: {
      avatarMode?: PageAvatarMode;
      heroSource?: PageHeroSource;
    } = {};

    if (snapshot.isPreviewingLayout) {
      patch.avatarMode = snapshot.previewAvatarMode;
    }

    if (snapshot.isPreviewingHeroSource) {
      patch.heroSource = snapshot.previewHeroSource;
    }

    const txHash = await applyFacePatch(patch);
    if (txHash === null) {
      return;
    }

    setTxResult({
      type: 'success',
      msg: txToastSuccess.pageLookSaved,
      explorerHref: nearExplorerTxHref(txHash),
    });
    setFarewellSnapshot(snapshot);
    dismissTimerRef.current = setTimeout(() => {
      discardPreview();
      setFarewellSnapshot(null);
    }, SAVED_DISMISS_MS);
  }

  return (
    <div
      className={`${osFloatingPanelClassName} ${osSheetFloatingPanelClassName} portfolio-face-preview-bar portfolio-face-preview-bar--enter`}
      role="status"
    >
      <p className="portfolio-face-preview-bar-label">
        <strong>{previewLabel}</strong>
        {showSavedMeta ? (
          <span className={osSheetFloatingPanelMetaClassName}>
            {' '}
            · {savedLabel}
          </span>
        ) : null}
      </p>
      <div className="os-commit-actions">
        {!isApplying ? (
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
            ready={!isApplying}
            pending={isApplying}
            pendingLabel="Saving…"
            disabled={isApplying}
            onClick={() => void handleSave()}
          >
            Save
          </OsSheetAction>
        </OsSheetActions>
      </div>
    </div>
  );
}
