'use client';

import { useApplyPageFace } from '@/hooks/use-apply-page-face';
import { usePortfolioFacePreview } from '@/contexts/portfolio-face-preview-context';
import type { PageAvatarMode, PublicPageConfig } from '@/lib/page-data';

const AVATAR_LABELS: Record<PageAvatarMode, string> = {
  standard: 'Standard',
  cover: 'Cover',
};

interface PortfolioFacePreviewBarProps {
  pageAccountId: string;
  config: PublicPageConfig;
}

export function PortfolioFacePreviewBar({
  pageAccountId,
  config,
}: PortfolioFacePreviewBarProps) {
  const {
    committedAvatarMode,
    previewAvatarMode,
    isPreviewing,
    discardPreview,
  } = usePortfolioFacePreview();
  const { applyAvatarMode, isApplying, isOwner, error } = useApplyPageFace(
    pageAccountId,
    config
  );

  if (!isOwner || !isPreviewing || !previewAvatarMode) {
    return null;
  }

  const previewLabel = AVATAR_LABELS[previewAvatarMode];
  const committedLabel = AVATAR_LABELS[committedAvatarMode];

  async function handleSave() {
    const saved = await applyAvatarMode(previewAvatarMode!);
    if (saved) {
      discardPreview();
    }
  }

  return (
    <div className="portfolio-face-preview-bar animate-rise-in" role="status">
      <p className="portfolio-face-preview-copy">
        Previewing <strong>{previewLabel}</strong>
        <span className="portfolio-face-preview-meta">
          {' '}
          · saved as {committedLabel}
        </span>
      </p>
      <div className="portfolio-face-preview-actions">
        <button
          type="button"
          className="portfolio-face-preview-discard"
          disabled={isApplying}
          onClick={discardPreview}
        >
          Discard
        </button>
        <button
          type="button"
          className="portfolio-face-preview-save"
          disabled={isApplying}
          onClick={() => void handleSave()}
        >
          {isApplying ? 'Saving…' : 'Save layout'}
        </button>
      </div>
      {error ? <p className="portfolio-face-preview-error">{error}</p> : null}
    </div>
  );
}
