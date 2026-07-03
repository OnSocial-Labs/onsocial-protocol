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

/** Compact storage bar — same grid as Activity row (label · bar · ratio · Open). */
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
        className="account-wallet-storage-strip"
        role="status"
        aria-busy="true"
        aria-label="Loading storage"
      >
        <div className="account-wallet-metric-row">
          <span className="account-wallet-metric-label">
            {PLATFORM_STORAGE_MENU_LABEL}
          </span>
          <span className="account-wallet-progress-track is-loading" aria-hidden />
          <span className="account-wallet-ratio is-loading" aria-hidden />
          <span className="account-wallet-metric-action is-loading" aria-hidden />
        </div>
        <p className="account-wallet-caption is-empty" aria-hidden>
          {'\u00a0'}
        </p>
      </div>
    );
  }

  if (error || !summary) {
    return (
      <div className="account-wallet-storage-strip">
        <div className="account-wallet-metric-row">
          <span className="account-wallet-metric-label">
            {PLATFORM_STORAGE_MENU_LABEL}
          </span>
          <span className="account-wallet-metric-status account-wallet-metric-status--fill">
            {error ?? 'Unavailable'}
          </span>
          <StorageOpenButton
            highlighted={manageHighlighted}
            onClick={onOpenManage}
          />
        </div>
        <p className="account-wallet-caption is-empty" aria-hidden>
          {'\u00a0'}
        </p>
      </div>
    );
  }

  if (summary.phase === 'inactive') {
    return (
      <div className="account-wallet-storage-strip">
        <div className="account-wallet-metric-row">
          <span className="account-wallet-metric-label">
            {PLATFORM_STORAGE_MENU_LABEL}
          </span>
          <span className="account-wallet-metric-status account-wallet-metric-status--fill">
            activates on first save
          </span>
          <StorageOpenButton
            highlighted={manageHighlighted}
            onClick={onOpenManage}
          />
        </div>
        <p className="account-wallet-caption is-empty" aria-hidden>
          {'\u00a0'}
        </p>
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
  const metaLabel = `${formatCompactBytes(summary.storedBytes)} stored · +${formatCompactBytes(summary.dailyRefillBytes)}/day`;

  return (
    <div className="account-wallet-storage-strip">
      <div className="account-wallet-metric-row">
        <span className="account-wallet-metric-label">
          {PLATFORM_STORAGE_MENU_LABEL}
        </span>
        <div
          className="account-wallet-progress-slot"
          role="progressbar"
          aria-valuenow={summary.availableBytes}
          aria-valuemin={0}
          aria-valuemax={summary.maxBufferBytes}
          aria-label={ratioAriaLabel}
        >
          <span className="account-wallet-progress-track">
            <span
              className={`account-wallet-progress-fill${empty ? ' is-empty' : low ? ' is-low' : ''}`}
              style={{ width: `${fill}%` }}
            />
          </span>
        </div>
        <span
          className={`account-wallet-ratio${empty || summary.phase === 'exhausted' ? ' is-low' : low ? ' is-low' : ''}`}
          aria-hidden
        >
          {ratioLabel}
        </span>
        <StorageOpenButton
          highlighted={manageHighlighted}
          onClick={onOpenManage}
        />
      </div>
      <p className="account-wallet-caption">{metaLabel}</p>
    </div>
  );
}
