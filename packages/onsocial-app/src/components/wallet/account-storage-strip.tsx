'use client';

import { ChevronRightIcon } from '@onsocial/ui';
import {
  formatPlatformStorageStatusLine,
  PLATFORM_STORAGE_MENU_LABEL,
  type PlatformStorageSummary,
} from '@/lib/platform-storage-display';

interface AccountStorageStripProps {
  loading: boolean;
  error: string | null;
  summary: PlatformStorageSummary | null;
  manageHighlighted?: boolean;
  onOpenManage: () => void;
}

/** Full-width storage row — the whole row opens manage. */
export function AccountStorageStrip({
  loading,
  error,
  summary,
  manageHighlighted = false,
  onOpenManage,
}: AccountStorageStripProps) {
  const tone =
    manageHighlighted || (summary != null && summary.availableBytes === 0)
      ? ' is-attention'
      : '';

  const description = formatPlatformStorageStatusLine({
    loading,
    error,
    summary,
  });

  return (
    <button
      type="button"
      className={`os-surface-row os-surface-row--navigate account-storage-row${tone}`}
      onClick={onOpenManage}
      disabled={loading}
      aria-busy={loading || undefined}
    >
      <span className="os-surface-row-copy">
        <span className="os-surface-row-label">
          {PLATFORM_STORAGE_MENU_LABEL}
        </span>
        <span className="os-surface-row-description">{description}</span>
      </span>
      <ChevronRightIcon aria-hidden className="os-surface-row-arrow" />
    </button>
  );
}
