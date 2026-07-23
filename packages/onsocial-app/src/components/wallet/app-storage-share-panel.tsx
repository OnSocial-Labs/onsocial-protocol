'use client';

import { useCallback, useEffect, useId, useMemo, useState } from 'react';
import { OsSheetActions, OsSheetPrimaryAction } from '@onsocial/ui';
import { MultiplyIcon, PlusIcon } from '@onsocial/ui';
import { useAppTransactionFeedback } from '@/contexts/app-transaction-feedback-context';
import { useStorageSharesGranted } from '@/hooks/use-storage-shares-granted';
import { useStorageShareRecipientsValidation } from '@/hooks/use-storage-share-recipients';
import type { ShareRecipientRowStatus } from '@/hooks/use-storage-share-recipients';
import type { SharedStoragePoolSummary } from '@/hooks/use-shared-storage-pool';
import { finalizeAmountInput } from '@/lib/amount-input';
import {
  sendStorageShareBatchTransaction,
  sendStorageSharedPoolDepositTransaction,
  type SigningWallet,
} from '@/lib/app-storage-transactions';
import {
  nearAccountPlaceholder,
  sanitizeNearAccountInput,
} from '@/lib/app-near-account';
import { formatNearCompact } from '@/lib/format-near-balance';
import { formatCompactBytes } from '@/lib/platform-storage-display';
import {
  clampStorageNearAmountInput,
  formatStorageMinNearLabel,
  isValidShareBytesPerRecipient,
  isValidStorageAmountInput,
  MAX_STORAGE_SHARE_RECIPIENTS,
  MIN_SHARED_STORAGE_BYTES,
  parseStorageAmountYocto,
  resolveSharePoolBudgetBytes,
  shareGrantRemainingBytes,
  shareGrantUsedPercent,
  splitShareBytesPerRecipient,
  storageCapacityBytesFromNearInput,
  STORAGE_NEAR_INPUT_DECIMALS,
  STORAGE_SHARE_POOL_DEPOSIT_MIN_YOCTO,
  STORAGE_SHARE_POOL_DEPOSIT_PRESETS_NEAR,
  STORAGE_SHARE_PERCENT_PRESETS,
  USER_STORAGE_SHARE_POOL_DEPOSIT_HINT,
  USER_STORAGE_SHARE_HINT,
  type ActiveStorageShareGrant,
} from '@/lib/user-storage-display';
import { isWalletUserCancellation } from '@/lib/wallet-errors';
import {
  txToastConfirming,
  txToastError,
  txToastSuccess,
} from '@/lib/transaction-toast-copy';

const SHARE_POOL_LABEL = 'Share pool';

function shareRowIssueMessage(status: ShareRecipientRowStatus): string | null {
  switch (status) {
    case 'invalid':
      return 'Use a complete NEAR account.';
    case 'self':
      return 'You cannot share with yourself.';
    case 'duplicate':
      return 'Already in the list.';
    case 'already_sponsored':
      return 'Already has shared storage.';
    default:
      return null;
  }
}

function CompactByteAmount({
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

function SharePoolReadout({
  summary,
  loading,
  error,
  canAddCapacity,
  showAddCapacity,
  onToggleAddCapacity,
}: {
  summary: SharedStoragePoolSummary | null;
  loading: boolean;
  error: string | null;
  canAddCapacity: boolean;
  showAddCapacity: boolean;
  onToggleAddCapacity: () => void;
}) {
  if (loading) {
    return (
      <div className="app-storage-share-card is-loading" aria-hidden>
        <span className="account-wallet-progress-track is-loading" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="app-storage-share-card">
        <span className="account-card-wallet-label">{SHARE_POOL_LABEL}</span>
        <p className="app-storage-meta">Share pool unavailable right now.</p>
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
        <span className="account-card-wallet-label">{SHARE_POOL_LABEL}</span>
        {canAddCapacity ? (
          <button
            type="button"
            className="app-storage-share-link"
            onClick={onToggleAddCapacity}
          >
            {showAddCapacity ? 'Hide add' : 'Add more'}
          </button>
        ) : null}
      </div>

      {totalCapacityBytes > 0 ? (
        <>
          <div className="app-storage-share-hero">
            <p className="app-storage-share-available">
              <CompactByteAmount bytes={shareBudgetBytes} />
              <span>available</span>
            </p>
            <p className="app-storage-meta">
              {formatCompactBytes(sharedBytes)} shared of{' '}
              {formatCompactBytes(totalCapacityBytes)}
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
          <p className="app-storage-meta">
            Pool capacity for accounts you sponsor.
          </p>
        </>
      ) : (
        <p className="app-storage-meta">Not funded yet.</p>
      )}
    </div>
  );
}

function ShareRecipientRow({
  rowId,
  value,
  status,
  allocationBytes,
  canRemove,
  onValueChange,
  onRemove,
}: {
  rowId: string;
  value: string;
  status: ShareRecipientRowStatus;
  allocationBytes?: number | null;
  canRemove: boolean;
  onValueChange: (value: string) => void;
  onRemove: () => void;
}) {
  const issue = shareRowIssueMessage(status);

  return (
    <div className="app-storage-recipient-row">
      <label className="sr-only" htmlFor={`storage-share-recipient-${rowId}`}>
        Recipient account
      </label>
      <input
        id={`storage-share-recipient-${rowId}`}
        type="text"
        inputMode="text"
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        placeholder={nearAccountPlaceholder()}
        value={value}
        onChange={(event) =>
          onValueChange(sanitizeNearAccountInput(event.target.value))
        }
        className="app-storage-recipient-input"
        aria-invalid={Boolean(issue)}
      />
      {allocationBytes != null && allocationBytes > 0 ? (
        <CompactByteAmount bytes={allocationBytes} />
      ) : status === 'checking' ? (
        <span className="app-storage-recipient-status">Checking</span>
      ) : null}
      {canRemove ? (
        <button
          type="button"
          className="app-storage-recipient-remove"
          onClick={onRemove}
          aria-label="Remove recipient"
        >
          <MultiplyIcon
            aria-hidden
            className="app-storage-recipient-remove-icon"
          />
        </button>
      ) : null}
      {issue ? <p className="app-storage-recipient-error">{issue}</p> : null}
    </div>
  );
}

function ShareSplitVisual({
  sharePercent,
  readyCount,
  bytesPerRecipient,
  totalShareBytes,
  needsFunding,
}: {
  sharePercent: number;
  readyCount: number;
  bytesPerRecipient: number;
  totalShareBytes: number;
  needsFunding: boolean;
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
            ? `${sharePercent === 100 ? 'Max' : `${sharePercent}%`} split · ${formatCompactBytes(totalShareBytes)} across ${readyCount} recipients`
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
          ? `Minimum is ${formatCompactBytes(MIN_SHARED_STORAGE_BYTES)} per recipient.`
          : showBytes
            ? `≈ ${formatCompactBytes(bytesPerRecipient)} each · ${formatCompactBytes(totalShareBytes)} total`
            : 'Choose recipients to preview the split.'}
      </p>
    </div>
  );
}

function ShareGrantRow({ grant }: { grant: ActiveStorageShareGrant }) {
  const remaining = shareGrantRemainingBytes(grant);
  const usedPercent = shareGrantUsedPercent(grant);
  const fillWidth = grant.usedBytes > 0 ? Math.max(usedPercent, 8) : 0;
  const showUsage = grant.usedBytes > 0;

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
          aria-label={`${grant.accountId} shared storage usage`}
        >
          <span style={{ width: `${fillWidth}%` }} />
        </span>
      ) : null}
      <span className="app-storage-grant-bytes">
        {showUsage ? (
          <>
            <CompactByteAmount bytes={grant.usedBytes} muted />
            <span className="app-storage-share-muted"> / </span>
            <CompactByteAmount bytes={grant.maxBytes} />
          </>
        ) : (
          <CompactByteAmount bytes={remaining} />
        )}
      </span>
    </li>
  );
}

function StorageSharesGrantedReadout({
  grants,
  loading,
  error,
}: {
  grants: ActiveStorageShareGrant[];
  loading: boolean;
  error: string | null;
}) {
  if (loading) {
    return (
      <div className="app-storage-grants is-loading" aria-hidden>
        <span className="account-wallet-progress-track is-loading" />
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
        <span className="account-card-wallet-label">Shared with</span>
        {!error && grants.length > 0 ? (
          <span className="app-storage-grants-summary">
            {grants.length} · {formatCompactBytes(allocatedBytes)}
            {usedBytes > 0 ? ` · ${formatCompactBytes(usedBytes)} used` : ''}
          </span>
        ) : null}
      </div>

      {error ? (
        <p className="app-storage-meta">Active shares unavailable right now.</p>
      ) : (
        <ul className="app-storage-grants-list">
          {grants.map((grant) => (
            <ShareGrantRow key={grant.accountId} grant={grant} />
          ))}
        </ul>
      )}
    </div>
  );
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : 'Transaction did not go through.';
}

export function AppStorageSharePanel({
  accountId,
  refreshKey = 0,
  sharedPool,
  sharedPoolLoading,
  sharedPoolError,
  walletNearYocto,
  pending,
  error,
  setPending,
  onError,
  onPoolChanged,
  getSigningWallet,
}: {
  accountId: string;
  refreshKey?: number;
  sharedPool: SharedStoragePoolSummary | null;
  sharedPoolLoading: boolean;
  sharedPoolError: string | null;
  walletNearYocto: bigint | null | undefined;
  pending: boolean;
  error: string | null;
  setPending: (pending: boolean) => void;
  onError: (message: string | null) => void;
  onPoolChanged: () => void;
  getSigningWallet: () => Promise<SigningWallet>;
}) {
  const { trackTransaction } = useAppTransactionFeedback();
  const baseId = useId();
  const [rows, setRows] = useState<string[]>(['']);
  const [sharePercent, setSharePercent] = useState<number>(100);
  const [fundAmountInput, setFundAmountInput] = useState('0.1');
  const [showAddCapacity, setShowAddCapacity] = useState(false);
  const [pendingShareTargets, setPendingShareTargets] = useState<string[]>([]);

  const availableBytes = sharedPool?.availableBytes ?? 0;
  const sharedBytes = sharedPool?.sharedBytes ?? 0;
  const totalCapacityBytes = sharedPool?.totalCapacityBytes ?? 0;
  const shareBudgetBytes = resolveSharePoolBudgetBytes({
    availableBytes,
    sharedBytes,
    totalCapacityBytes,
  });
  const poolUnavailable = Boolean(sharedPoolError);
  const needsFunding =
    !poolUnavailable && (!sharedPool || totalCapacityBytes <= 0);
  const showFundPanel = needsFunding || showAddCapacity;
  const showShareFlow = !poolUnavailable && !showFundPanel;
  const activeShares = useStorageSharesGranted(
    accountId,
    true,
    refreshKey,
    pendingShareTargets
  );

  useEffect(() => {
    if (pendingShareTargets.length === 0) return;

    const grantIds = new Set(
      activeShares.grants.map((grant) => grant.accountId)
    );
    if (pendingShareTargets.every((targetId) => grantIds.has(targetId))) {
      setPendingShareTargets([]);
    }
  }, [activeShares.grants, pendingShareTargets]);

  const recipientValidation = useStorageShareRecipientsValidation(
    rows,
    accountId,
    true
  );

  const readyRecipients = recipientValidation.readyNormalizedIds;

  const bytesPerRecipient = splitShareBytesPerRecipient(
    shareBudgetBytes,
    readyRecipients.length,
    sharePercent
  );

  const canFundAmount = useMemo(() => {
    const normalized = finalizeAmountInput(
      fundAmountInput,
      STORAGE_NEAR_INPUT_DECIMALS
    );
    return isValidStorageAmountInput(normalized, 'deposit', {
      minYocto: STORAGE_SHARE_POOL_DEPOSIT_MIN_YOCTO,
      maxYocto: walletNearYocto ?? undefined,
    });
  }, [fundAmountInput, walletNearYocto]);

  const canShare =
    readyRecipients.length > 0 &&
    isValidShareBytesPerRecipient(bytesPerRecipient) &&
    shareBudgetBytes > 0 &&
    !needsFunding &&
    recipientValidation.statuses.every(
      (status) => status === 'empty' || status === 'ready'
    );

  const applyFundAmountInput = useCallback(
    (raw: string) => {
      setFundAmountInput(
        clampStorageNearAmountInput(raw, {
          maxYocto: walletNearYocto ?? undefined,
        })
      );
    },
    [walletNearYocto]
  );

  const updateRow = (index: number, value: string) => {
    setRows((current) =>
      current.map((row, rowIndex) => (rowIndex === index ? value : row))
    );
  };

  const addRow = () => {
    setRows((current) =>
      current.length >= MAX_STORAGE_SHARE_RECIPIENTS
        ? current
        : [...current, '']
    );
  };

  const removeRow = (index: number) => {
    setRows((current) =>
      current.length <= 1
        ? current
        : current.filter((_, rowIndex) => rowIndex !== index)
    );
  };

  const handleFundPool = async () => {
    const normalized = finalizeAmountInput(
      fundAmountInput,
      STORAGE_NEAR_INPUT_DECIMALS
    );

    let amountYocto: bigint;
    try {
      amountYocto = parseStorageAmountYocto(normalized, 'deposit', {
        minYocto: STORAGE_SHARE_POOL_DEPOSIT_MIN_YOCTO,
        maxYocto: walletNearYocto ?? undefined,
      });
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Invalid amount.');
      return;
    }

    onError(null);
    setPending(true);

    try {
      const txHashes = await sendStorageSharedPoolDepositTransaction(
        getSigningWallet,
        accountId,
        amountYocto.toString()
      );
      const confirmed = await trackTransaction({
        txHashes,
        submittedMessage: txToastConfirming.fundingSharePool,
        successMessage: txToastSuccess.sharePoolFunded,
        failureMessage: txToastError.sharePoolFundFailed,
        onFailure: (message) => onError(message),
      });
      if (!confirmed) return;
    } catch (err) {
      if (isWalletUserCancellation(err)) return;
      const message = getErrorMessage(err);
      onError(message);
      return;
    } finally {
      setPending(false);
    }

    setShowAddCapacity(false);
    onPoolChanged();
  };

  const handleShare = async () => {
    if (!canShare) return;

    onError(null);
    setPending(true);

    try {
      const txHashes = await sendStorageShareBatchTransaction(
        getSigningWallet,
        readyRecipients.map((targetAccountId) => ({
          targetAccountId,
          maxBytes: bytesPerRecipient,
        }))
      );
      const confirmed = await trackTransaction({
        txHashes,
        submittedMessage: txToastConfirming.sharingStorage,
        successMessage: txToastSuccess.storageShared,
        failureMessage: txToastError.storageShareFailed,
        onFailure: (message) => onError(message),
      });
      if (!confirmed) return;
    } catch (err) {
      if (isWalletUserCancellation(err)) return;
      const message = getErrorMessage(err);
      onError(message);
      return;
    } finally {
      setPending(false);
    }

    setPendingShareTargets((current) => [
      ...new Set([...current, ...readyRecipients]),
    ]);
    setRows(['']);
    onPoolChanged();
  };

  const amountHint = formatStorageMinNearLabel(
    STORAGE_SHARE_POOL_DEPOSIT_MIN_YOCTO
  );
  const normalizedFundAmount = finalizeAmountInput(
    fundAmountInput,
    STORAGE_NEAR_INPUT_DECIMALS
  );
  const fundPreviewCapacityBytes =
    storageCapacityBytesFromNearInput(fundAmountInput);
  const totalShareBytes = bytesPerRecipient * readyRecipients.length;

  return (
    <div className="app-storage-share-panel">
      <SharePoolReadout
        summary={sharedPool}
        loading={sharedPoolLoading}
        error={sharedPoolError}
        canAddCapacity={!needsFunding && !sharedPoolLoading}
        showAddCapacity={showAddCapacity}
        onToggleAddCapacity={() => {
          setShowAddCapacity((open) => !open);
        }}
      />

      {showFundPanel ? (
        <div className="app-storage-share-fund">
          <p className="app-storage-meta">
            Add NEAR to @{accountId}&apos;s share pool.
          </p>
          <div className="app-storage-amount-field">
            <input
              type="text"
              inputMode="decimal"
              autoComplete="off"
              value={fundAmountInput}
              onChange={(event) => applyFundAmountInput(event.target.value)}
              onBlur={() =>
                applyFundAmountInput(
                  finalizeAmountInput(
                    fundAmountInput,
                    STORAGE_NEAR_INPUT_DECIMALS
                  )
                )
              }
              placeholder={amountHint}
              aria-label="Share pool fund amount in NEAR"
              aria-invalid={Boolean(fundAmountInput) && !canFundAmount}
              className="app-storage-amount-input"
            />
            <span className="account-card-balance-unit">NEAR</span>
          </div>
          <div className="app-storage-quick-row">
            <div
              className="app-storage-presets"
              role="group"
              aria-label="Quick fund amounts"
            >
              {STORAGE_SHARE_POOL_DEPOSIT_PRESETS_NEAR.map((preset) => (
                <button
                  key={preset}
                  type="button"
                  className={`os-surface-chip${normalizedFundAmount === preset ? ' is-selected' : ''}`}
                  onClick={() => applyFundAmountInput(preset)}
                >
                  {preset}
                </button>
              ))}
            </div>
            <p className="app-storage-amount-meta">
              {fundPreviewCapacityBytes != null &&
              fundPreviewCapacityBytes > 0 ? (
                <>≈ {formatCompactBytes(fundPreviewCapacityBytes)} · </>
              ) : null}
              {walletNearYocto != null ? (
                <>Balance {formatNearCompact(walletNearYocto.toString())} · </>
              ) : null}
              Min {amountHint}
            </p>
          </div>
          {error ? (
            <p className="app-storage-error" role="alert">
              {error}
            </p>
          ) : null}
          <OsSheetActions layout="stack" tone="frosted-primary" borderless>
            <OsSheetPrimaryAction
              type="button"
              ready={!pending && canFundAmount && !error}
              pending={pending}
              pendingLabel="Adding…"
              disabled={pending || !canFundAmount}
              onClick={() => void handleFundPool()}
            >
              {needsFunding ? 'Fund share pool' : 'Add to share pool'}
            </OsSheetPrimaryAction>
          </OsSheetActions>
          <p className="app-storage-hint app-storage-hint--compact">
            {USER_STORAGE_SHARE_POOL_DEPOSIT_HINT}
          </p>
        </div>
      ) : null}

      {showShareFlow ? (
        <div className="app-storage-share-flow">
          <div className="app-storage-share-recipients">
            <div className="app-storage-share-card-head">
              <span className="account-card-wallet-label">Recipients</span>
              <button
                type="button"
                className="app-storage-share-link"
                onClick={addRow}
                disabled={rows.length >= MAX_STORAGE_SHARE_RECIPIENTS}
              >
                <PlusIcon
                  aria-hidden
                  className="app-storage-share-add-icon"
                />
                Add
              </button>
            </div>
            {rows.map((row, index) => {
              const status = recipientValidation.statuses[index] ?? 'empty';
              return (
                <ShareRecipientRow
                  key={`${baseId}-${index}`}
                  rowId={`${index}`}
                  value={row}
                  status={status}
                  allocationBytes={
                    status === 'ready' && bytesPerRecipient > 0
                      ? bytesPerRecipient
                      : null
                  }
                  canRemove={rows.length > 1}
                  onValueChange={(value) => updateRow(index, value)}
                  onRemove={() => removeRow(index)}
                />
              );
            })}
          </div>

          <div className="app-storage-share-split-controls">
            <div
              className="app-storage-presets"
              role="group"
              aria-label="Share pool percent"
            >
              {STORAGE_SHARE_PERCENT_PRESETS.map((preset) => (
                <button
                  key={preset}
                  type="button"
                  className={`os-surface-chip${sharePercent === preset ? ' is-selected' : ''}`}
                  onClick={() => setSharePercent(preset)}
                >
                  {preset === 100 ? 'Max' : `${preset}%`}
                </button>
              ))}
            </div>
            <ShareSplitVisual
              sharePercent={sharePercent}
              readyCount={readyRecipients.length}
              bytesPerRecipient={bytesPerRecipient}
              totalShareBytes={totalShareBytes}
              needsFunding={needsFunding}
            />
          </div>

          {error ? (
            <p className="app-storage-error" role="alert">
              {error}
            </p>
          ) : null}

          <OsSheetActions layout="stack" tone="frosted-primary" borderless>
            <OsSheetPrimaryAction
              type="button"
              ready={!pending && canShare && !error}
              pending={pending}
              pendingLabel="Sharing…"
              disabled={pending || !canShare}
              onClick={() => void handleShare()}
            >
              Share storage
            </OsSheetPrimaryAction>
          </OsSheetActions>
          <p className="app-storage-hint app-storage-hint--compact">
            {USER_STORAGE_SHARE_HINT}
          </p>
          <StorageSharesGrantedReadout
            grants={activeShares.grants}
            loading={activeShares.loading}
            error={activeShares.error}
          />
        </div>
      ) : null}
    </div>
  );
}
