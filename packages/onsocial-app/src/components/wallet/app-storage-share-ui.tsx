'use client';

import type { ReactNode } from 'react';
import { OsFieldRemove } from '@onsocial/ui';
import { NearAccountField } from '@/components/ui/near-account-field';
import type { ShareRecipientRowStatus } from '@/hooks/use-storage-share-recipients';
import type { NearAccountStatus } from '@/hooks/use-near-account-status';
import type { SharedStoragePoolSummary } from '@/hooks/use-shared-storage-pool';
import { nearAccountPlaceholder } from '@/lib/app-near-account';
import { formatNearCompact } from '@/lib/format-near-balance';
import { formatCompactBytes } from '@/lib/platform-storage-display';
import {
  isValidShareBytesPerRecipient,
  MIN_SHARED_STORAGE_BYTES,
  resolveSharePoolBudgetBytes,
  shareGrantRemainingBytes,
  shareGrantUsedPercent,
  type ActiveStorageShareGrant,
} from '@/lib/user-storage-display';

export type StorageShareIssueCopy = Partial<
  Record<
    Exclude<ShareRecipientRowStatus, 'empty' | 'checking' | 'ready'>,
    string
  >
>;

const DEFAULT_ISSUE_COPY: Required<
  Pick<StorageShareIssueCopy, 'self' | 'duplicate' | 'already_sponsored'>
> = {
  self: 'You cannot share with yourself.',
  duplicate: 'Already in the list.',
  already_sponsored: 'Already has shared storage.',
};

/**
 * Inline copy under the field. Incomplete (`invalid`) is lip tint only —
 * same as invite / transfer while typing; text is for blockers that need a why.
 */
export function storageShareRowIssueMessage(
  status: ShareRecipientRowStatus,
  copy?: StorageShareIssueCopy
): string | null {
  switch (status) {
    case 'invalid':
      return copy?.invalid ?? null;
    case 'self':
      return copy?.self ?? DEFAULT_ISSUE_COPY.self;
    case 'duplicate':
      return copy?.duplicate ?? DEFAULT_ISSUE_COPY.duplicate;
    case 'already_sponsored':
      return copy?.already_sponsored ?? DEFAULT_ISSUE_COPY.already_sponsored;
    default:
      return null;
  }
}

export function storageShareRowNearField(status: ShareRecipientRowStatus): {
  status: NearAccountStatus;
  statusClass?: string;
} {
  switch (status) {
    case 'empty':
      return { status: 'idle' };
    case 'checking':
      return { status: 'checking' };
    case 'ready':
      return { status: 'found', statusClass: 'is-available' };
    case 'invalid':
      return { status: 'invalid', statusClass: 'is-taken' };
    case 'self':
    case 'duplicate':
    case 'already_sponsored':
      return { status: 'found', statusClass: 'is-taken' };
  }
}

export function CompactByteAmount({
  bytes,
  muted = false,
}: {
  bytes: number;
  muted?: boolean;
}) {
  const formatted = formatCompactBytes(bytes);
  const parts = formatted.match(/^([\d.]+)\s+(.+)$/);

  if (!parts) {
    return (
      <span className={`app-storage-byte${muted ? ' is-muted' : ''}`}>
        {formatted}
      </span>
    );
  }

  return (
    <span className={`app-storage-byte${muted ? ' is-muted' : ''}`}>
      <span>{parts[1]}</span>
      <span className="app-storage-byte-unit"> {parts[2]}</span>
    </span>
  );
}

export function StorageSharePoolReadout({
  label,
  summary,
  loading,
  error,
  errorMessage,
  canAddCapacity,
  showAddCapacity,
  onToggleAddCapacity,
  addToggleLabels = { show: 'Add more', hide: 'Hide add' },
  capacityHint,
  loadingGhost = '0 KB shared of 0 KB',
  heroMeta,
}: {
  label: string;
  summary: SharedStoragePoolSummary | null;
  loading: boolean;
  error: string | null;
  errorMessage: string;
  canAddCapacity: boolean;
  showAddCapacity: boolean;
  onToggleAddCapacity: () => void;
  addToggleLabels?: { show: string; hide: string };
  capacityHint: string;
  loadingGhost?: string;
  /** When set, replaces the default “shared of capacity” meta line. */
  heroMeta?: ReactNode;
}) {
  if (loading) {
    return (
      <div className="app-storage-share-card" aria-busy="true">
        <div className="app-storage-share-card-head">
          <span className="account-card-wallet-label">{label}</span>
        </div>
        <p className="app-storage-meta">
          <span className="app-storage-pending-ghost">{loadingGhost}</span>
        </p>
        <div className="account-wallet-progress-track" aria-hidden>
          <span
            className="account-wallet-progress-fill"
            style={{ width: '0%' }}
          />
        </div>
        <p className="app-storage-meta">{capacityHint}</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="app-storage-share-card">
        <span className="account-card-wallet-label">{label}</span>
        <p className="app-storage-meta">{errorMessage}</p>
      </div>
    );
  }

  const totalCapacityBytes = summary?.totalCapacityBytes ?? 0;
  const sharedBytes = summary?.sharedBytes ?? 0;
  const availableBytes = summary?.availableBytes ?? 0;
  const shareBudgetBytes = resolveSharePoolBudgetBytes({
    availableBytes,
    sharedBytes,
    totalCapacityBytes,
  });
  const allocatedPercent =
    totalCapacityBytes > 0
      ? Math.min(100, Math.round((sharedBytes / totalCapacityBytes) * 100))
      : 0;
  const barFill =
    sharedBytes > 0 ? Math.max(allocatedPercent, 4) : allocatedPercent;

  return (
    <div className="app-storage-share-card">
      <div className="app-storage-share-card-head">
        <span className="account-card-wallet-label">{label}</span>
        {canAddCapacity ? (
          <button
            type="button"
            className="app-storage-share-link os-disabled-ink"
            onClick={onToggleAddCapacity}
          >
            {showAddCapacity ? addToggleLabels.hide : addToggleLabels.show}
          </button>
        ) : null}
      </div>

      {totalCapacityBytes > 0 ? (
        <>
          <div className="app-storage-share-hero">
            <p className="app-storage-share-available">
              <CompactByteAmount bytes={shareBudgetBytes} />
              <span className="app-storage-share-muted"> available</span>
            </p>
            <p className="app-storage-meta">
              {heroMeta ?? (
                <>
                  {formatCompactBytes(sharedBytes)} shared of{' '}
                  {formatCompactBytes(totalCapacityBytes)}
                </>
              )}
            </p>
          </div>
          <div
            className="account-wallet-progress-track"
            role="progressbar"
            aria-valuenow={sharedBytes}
            aria-valuemin={0}
            aria-valuemax={totalCapacityBytes}
            aria-label={`${formatCompactBytes(sharedBytes)} shared · ${formatCompactBytes(shareBudgetBytes)} available of ${formatCompactBytes(totalCapacityBytes)} capacity`}
          >
            <span
              className="account-wallet-progress-fill"
              style={{ width: `${barFill}%` }}
            />
          </div>
          <p className="app-storage-meta">{capacityHint}</p>
        </>
      ) : (
        <p className="app-storage-meta">Not funded yet.</p>
      )}
    </div>
  );
}

export function StorageShareRecipientRow({
  rowId,
  idPrefix = 'storage-share-recipient',
  label = 'Recipient account',
  value,
  status,
  allocationBytes,
  canRemove,
  disabled = false,
  removeAriaLabel = 'Remove recipient',
  issueCopy,
  below,
  onValueChange,
  onRemove,
}: {
  rowId: string;
  idPrefix?: string;
  label?: string;
  value: string;
  status: ShareRecipientRowStatus;
  allocationBytes?: number | null;
  canRemove: boolean;
  disabled?: boolean;
  removeAriaLabel?: string;
  issueCopy?: StorageShareIssueCopy;
  /** Full-width slot under the field (e.g. guild member search picks). */
  below?: ReactNode;
  onValueChange: (value: string) => void;
  onRemove: () => void;
}) {
  const issue = storageShareRowIssueMessage(status, issueCopy);
  const nearField = storageShareRowNearField(status);
  const fieldId = `${idPrefix}-${rowId}`;
  const invalid =
    status === 'invalid' ||
    status === 'self' ||
    status === 'duplicate' ||
    status === 'already_sponsored';

  return (
    <div className="app-storage-recipient">
      <div className="app-storage-recipient-row">
        <label className="sr-only" htmlFor={fieldId}>
          {label}
        </label>
        <NearAccountField
          id={fieldId}
          value={value}
          onValueChange={onValueChange}
          placeholder={nearAccountPlaceholder()}
          status={nearField.status}
          statusClass={nearField.statusClass}
          disabled={disabled}
          aria-invalid={invalid}
        />
        {allocationBytes != null && allocationBytes > 0 ? (
          <CompactByteAmount bytes={allocationBytes} />
        ) : status === 'checking' ? (
          <span className="app-storage-recipient-status">Checking</span>
        ) : null}
        {canRemove ? (
          <OsFieldRemove
            aria-label={removeAriaLabel}
            disabled={disabled}
            onClick={onRemove}
          />
        ) : null}
      </div>
      {issue ? <p className="app-storage-recipient-error">{issue}</p> : null}
      {below ? (
        <div className="app-storage-recipient-below">{below}</div>
      ) : null}
    </div>
  );
}

export function StorageShareSplitVisual({
  sharePercent,
  readyCount,
  bytesPerRecipient,
  totalShareBytes,
  needsFunding,
  recipientNoun = 'recipients',
  emptyHint = 'Choose recipients to preview the split.',
}: {
  sharePercent: number;
  readyCount: number;
  bytesPerRecipient: number;
  totalShareBytes: number;
  needsFunding: boolean;
  recipientNoun?: string;
  emptyHint?: string;
}) {
  const belowMin =
    readyCount > 0 &&
    !needsFunding &&
    !isValidShareBytesPerRecipient(bytesPerRecipient);
  const showBytes = readyCount > 0 && !needsFunding && bytesPerRecipient > 0;

  return (
    <div className="app-storage-share-split">
      <div
        className="app-storage-share-split-track"
        role="img"
        aria-label={
          showBytes
            ? `${sharePercent === 100 ? 'Max' : `${sharePercent}%`} split · ${formatCompactBytes(totalShareBytes)} across ${readyCount} ${recipientNoun}`
            : `${sharePercent === 100 ? 'Max' : `${sharePercent}%`} pool split`
        }
      >
        <span
          className={`app-storage-share-split-fill${belowMin ? ' is-low' : ''}`}
          style={{ width: `${sharePercent}%` }}
        >
          {readyCount > 0
            ? Array.from({ length: readyCount }, (_, index) => (
                <span key={index} aria-hidden />
              ))
            : null}
        </span>
      </div>
      <p className={`app-storage-meta${belowMin ? ' is-low' : ''}`}>
        {belowMin
          ? `Minimum is ${formatCompactBytes(MIN_SHARED_STORAGE_BYTES)} per ${recipientNoun === 'members' ? 'member' : 'recipient'}.`
          : showBytes
            ? `≈ ${formatCompactBytes(bytesPerRecipient)} each · ${formatCompactBytes(totalShareBytes)} total`
            : emptyHint}
      </p>
    </div>
  );
}

function StorageShareGrantRow({
  grant,
  usageAriaLabel,
  pending = false,
  onRevoke,
}: {
  grant: ActiveStorageShareGrant;
  usageAriaLabel: string;
  pending?: boolean;
  onRevoke?: (accountId: string) => void;
}) {
  const remaining = shareGrantRemainingBytes(grant);
  const usedPercent = shareGrantUsedPercent(grant);
  const fillWidth = grant.usedBytes > 0 ? Math.max(usedPercent, 8) : 0;
  const showUsage = grant.usedBytes > 0;
  const pendingGrant = grant.maxBytes <= 0;

  return (
    <li className="app-storage-grant-row">
      <span className="app-storage-grant-account" title={`@${grant.accountId}`}>
        @{grant.accountId}
      </span>
      {showUsage ? (
        <span
          className="app-storage-grant-usage"
          role="progressbar"
          aria-valuenow={usedPercent}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={usageAriaLabel}
        >
          <span style={{ width: `${fillWidth}%` }} />
        </span>
      ) : null}
      <span className="app-storage-grant-bytes">
        {pendingGrant ? (
          <span className="app-storage-share-muted">Pending…</span>
        ) : showUsage ? (
          <>
            <CompactByteAmount bytes={grant.usedBytes} muted />
            <span className="app-storage-share-muted"> / </span>
            <CompactByteAmount bytes={grant.maxBytes} />
          </>
        ) : (
          <CompactByteAmount bytes={remaining} />
        )}
      </span>
      {onRevoke ? (
        <button
          type="button"
          className="app-storage-share-link os-disabled-ink"
          disabled={pending || pendingGrant}
          onClick={() => onRevoke(grant.accountId)}
        >
          Remove
        </button>
      ) : null}
    </li>
  );
}

export function StorageShareGrantsReadout({
  label,
  grants,
  loading,
  error,
  errorMessage,
  pending = false,
  onRevoke,
  grantUsageLabel = (accountId) => `${accountId} shared storage usage`,
}: {
  label: string;
  grants: ActiveStorageShareGrant[];
  loading: boolean;
  error: string | null;
  errorMessage: string;
  pending?: boolean;
  onRevoke?: (accountId: string) => void;
  grantUsageLabel?: (accountId: string) => string;
}) {
  if (loading) {
    return (
      <div className="app-storage-grants" aria-busy="true">
        <div className="app-storage-grants-head">
          <span className="account-card-wallet-label">{label}</span>
        </div>
        <p className="app-storage-meta">
          <span className="app-storage-pending-ghost">0 KB</span>
        </p>
      </div>
    );
  }

  if (!error && grants.length === 0) {
    return null;
  }

  const allocatedBytes = grants.reduce(
    (total, grant) => total + grant.maxBytes,
    0
  );
  const usedBytes = grants.reduce((total, grant) => total + grant.usedBytes, 0);

  return (
    <div className="app-storage-grants">
      <div className="app-storage-grants-head">
        <span className="account-card-wallet-label">{label}</span>
        {!error && grants.length > 0 ? (
          <span className="app-storage-grants-summary">
            {grants.length}
            {allocatedBytes > 0
              ? ` · ${formatCompactBytes(allocatedBytes)}`
              : ''}
            {usedBytes > 0 ? ` · ${formatCompactBytes(usedBytes)} used` : ''}
          </span>
        ) : null}
      </div>

      {error ? (
        <p className="app-storage-meta">{errorMessage}</p>
      ) : (
        <ul className="app-storage-grants-list">
          {grants.map((grant) => (
            <StorageShareGrantRow
              key={grant.accountId}
              grant={grant}
              usageAriaLabel={grantUsageLabel(grant.accountId)}
              pending={pending}
              onRevoke={onRevoke}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

/** Guild pool hero meta — NEAR balance + assigned %. */
export function guildStoragePoolHeroMeta(
  storageBalanceYocto: bigint,
  allocatedPercent: number
): ReactNode {
  return (
    <>
      {formatNearCompact(storageBalanceYocto.toString())} NEAR in pool ·{' '}
      {allocatedPercent}% assigned
    </>
  );
}
