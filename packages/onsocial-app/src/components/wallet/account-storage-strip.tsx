'use client';

import {
  formatCompactBytes,
  formatPlatformBufferRatioAriaLabel,
  formatPlatformBufferRatioLabel,
  PLATFORM_STORAGE_MENU_LABEL,
  APP_STORAGE_OPEN_LABEL,
  type PlatformStorageSummary,
} from '@/lib/platform-storage-display';

interface AccountStorageStripProps {
  loading: boolean;
  error: string | null;
  summary: PlatformStorageSummary | null;
  manageHighlighted?: boolean;
  onOpenManage: () => void;
}

function StorageOpenButton({
  highlighted,
  onClick,
}: {
  highlighted?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={`account-wallet-metric-action os-surface-chip${highlighted ? ' is-accent' : ''}`}
      onClick={onClick}
    >
      {APP_STORAGE_OPEN_LABEL}
    </button>
  );
}

/** Flat storage column inside the wallet panel (no nested card). */
export function AccountStorageStrip({
  loading,
  error,
  summary,
  manageHighlighted = false,
  onOpenManage,
}: AccountStorageStripProps) {
  if (loading) {
    return (
      <div
        className="account-wallet-metric-cell"
        role="status"
        aria-busy="true"
        aria-label="Loading storage"
      >
        <div className="account-wallet-metric-cell-head">
          <span className="account-wallet-metric-label">
            {PLATFORM_STORAGE_MENU_LABEL}
          </span>
          <span className="account-wallet-ratio is-loading" aria-hidden />
        </div>
        <div className="account-wallet-metric-cell-track">
          <span
            className="account-wallet-progress-track is-loading"
            aria-hidden
          />
          <span
            className="account-wallet-metric-action is-loading"
            aria-hidden
          />
        </div>
      </div>
    );
  }

  if (error || !summary) {
    return (
      <div className="account-wallet-metric-cell">
        <div className="account-wallet-metric-cell-head">
          <span className="account-wallet-metric-label">
            {PLATFORM_STORAGE_MENU_LABEL}
          </span>
        </div>
        <div className="account-wallet-metric-cell-track">
          <span className="account-wallet-metric-status">
            {error ?? 'Unavailable'}
          </span>
          <StorageOpenButton
            highlighted={manageHighlighted}
            onClick={onOpenManage}
          />
        </div>
      </div>
    );
  }

  if (summary.phase === 'inactive') {
    return (
      <div className="account-wallet-metric-cell">
        <div className="account-wallet-metric-cell-head">
          <span className="account-wallet-metric-label">
            {PLATFORM_STORAGE_MENU_LABEL}
          </span>
        </div>
        <div className="account-wallet-metric-cell-track">
          <span className="account-wallet-metric-status">
            activates on first save
          </span>
          <StorageOpenButton
            highlighted={manageHighlighted}
            onClick={onOpenManage}
          />
        </div>
      </div>
    );
  }

  const low = summary.availablePercent <= 25 && summary.availableBytes > 0;
  const empty = summary.availableBytes === 0;
  const fill =
    summary.availableBytes > 0 ? Math.max(summary.availablePercent, 3) : 0;
  const ratioLabel = formatPlatformBufferRatioLabel(
    summary.availableBytes,
    summary.maxBufferBytes
  );
  const ratioAriaLabel = formatPlatformBufferRatioAriaLabel(
    summary.availableBytes,
    summary.maxBufferBytes
  );
  const metaLabel = `${formatCompactBytes(summary.storedBytes)} covered · refills +${formatCompactBytes(summary.dailyRefillBytes)}/day`;
  const progressAriaLabel = `${ratioAriaLabel}. ${metaLabel}`;

  return (
    <div className="account-wallet-metric-cell">
      <div className="account-wallet-metric-cell-head">
        <span className="account-wallet-metric-label">
          {PLATFORM_STORAGE_MENU_LABEL}
        </span>
        <span
          className={`account-wallet-ratio${empty || summary.phase === 'exhausted' ? ' is-low' : low ? ' is-low' : ''}`}
          aria-hidden
        >
          {ratioLabel}
        </span>
      </div>
      <div className="account-wallet-metric-cell-track">
        <div
          className="account-wallet-progress-slot"
          role="progressbar"
          aria-valuenow={summary.availableBytes}
          aria-valuemin={0}
          aria-valuemax={summary.maxBufferBytes}
          aria-label={progressAriaLabel}
        >
          <span className="account-wallet-progress-track">
            <span
              className={`account-wallet-progress-fill${empty ? ' is-empty' : low ? ' is-low' : ''}`}
              style={{ width: `${fill}%` }}
            />
          </span>
        </div>
        <StorageOpenButton
          highlighted={manageHighlighted}
          onClick={onOpenManage}
        />
      </div>
      <p className="account-wallet-caption">{metaLabel}</p>
    </div>
  );
}
