'use client';

import { useEffect, useRef, useState } from 'react';
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
import { useApplyPageFace } from '@/hooks/use-apply-page-face';
import { usePortfolioFacePreview } from '@/contexts/portfolio-face-preview-context';
import type { PageAvatarMode, PageHeroSource, PublicPageConfig } from '@/lib/page-data';

const SAVED_DISMISS_MS = 900;

const AVATAR_LABELS: Record<PageAvatarMode, string> = {
  standard: 'Card',
  cover: 'Cover',
};

const HERO_LABELS: Record<PageHeroSource, string> = {
  banner: 'Banner hero',
  avatar: 'Avatar hero',
  none: 'Minimal hero',
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
  const [saved, setSaved] = useState(false);
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
  const previewLead =
    snapshot.isPreviewingLayout && !snapshot.isPreviewingHeroSource
      ? 'Previewing layout'
      : 'Previewing';

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

    const didSave = await applyFacePatch(patch);
    if (didSave) {
      setFarewellSnapshot(snapshot);
      setSaved(true);
      dismissTimerRef.current = setTimeout(() => {
        discardPreview();
        setSaved(false);
        setFarewellSnapshot(null);
      }, SAVED_DISMISS_MS);
    }
  }

  const actionsBusy = isApplying || saved;
  return (
    <div
      className={`${osFloatingPanelClassName} ${osSheetFloatingPanelClassName} portfolio-face-preview-bar portfolio-face-preview-bar--enter`}
      role="status"
    >
      <p className={osSheetFloatingPanelCopyClassName}>
        {previewLead} <strong>{previewLabel}</strong>
        <span className={osSheetFloatingPanelMetaClassName}>
          {' '}
          · saved as {savedLabel}
        </span>
      </p>
      <OsSheetActions layout="row-compact" tone="frosted-primary" borderless>
        {!actionsBusy ? (
          <OsSheetAction
            type="button"
            variant="danger"
            onClick={discardPreview}
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
          pending={isApplying}
          pendingLabel="Saving…"
          disabled={actionsBusy}
          className={actionsBusy ? osSheetActionExpandedClassName : undefined}
          onClick={() => void handleSave()}
        >
          Save page look
        </OsSheetAction>
      </OsSheetActions>

      {error ? (
        <p className={osSheetFloatingPanelErrorClassName}>{error}</p>
      ) : null}
    </div>
  );
}
