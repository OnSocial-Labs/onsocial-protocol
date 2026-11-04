'use client';

import { useCallback, useEffect, useId, useMemo, useState } from 'react';
import {
  AmountField,
  AmountFieldMetaRow,
  ChevronLeftIcon,
  ChevronRightIcon,
  OsSheetAction,
  OsSheetActions,
  PlusIcon,
} from '@onsocial/ui';
import {
  StorageShareGrantsReadout,
  StorageSharePoolReadout,
  StorageShareRecipientRow,
  StorageShareSplitVisual,
} from '@/components/wallet/app-storage-share-ui';
import { useAppTransactionFeedback } from '@/contexts/app-transaction-feedback-context';
import { useStorageSharesGranted } from '@/hooks/use-storage-shares-granted';
import { useStorageShareRecipientsValidation } from '@/hooks/use-storage-share-recipients';
import type { SharedStoragePoolSummary } from '@/hooks/use-shared-storage-pool';
import { finalizeAmountInput } from '@/lib/amount-input';
import {
  sendStorageShareBatchTransaction,
  sendStorageSharedPoolDepositTransaction,
  type SigningWallet,
} from '@/lib/app-storage-transactions';
import { formatNearCompact } from '@/lib/format-near-balance';
import { formatCompactBytes } from '@/lib/platform-storage-display';
import {
  clampStorageNearAmountInput,
  formatStorageMinNearLabel,
  isValidShareBytesPerRecipient,
  isValidStorageAmountInput,
  MAX_STORAGE_SHARE_RECIPIENTS,
  parseStorageAmountYocto,
  resolveSharePoolBudgetBytes,
  splitShareBytesPerRecipient,
  storageCapacityBytesFromNearInput,
  STORAGE_NEAR_INPUT_DECIMALS,
  STORAGE_SHARE_POOL_DEPOSIT_MIN_YOCTO,
  STORAGE_SHARE_POOL_DEPOSIT_PRESETS_NEAR,
  STORAGE_SHARE_PERCENT_PRESETS,
  USER_STORAGE_SHARE_POOL_DEPOSIT_HINT,
  USER_STORAGE_SHARE_HINT,
} from '@/lib/user-storage-display';
import { isWalletUserCancellation } from '@/lib/wallet-errors';
import {
  txToastConfirming,
  txToastError,
  txToastSuccess,
} from '@/lib/transaction-toast-copy';

const SHARE_POOL_LABEL = 'Share pool';

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
  const [composerOpen, setComposerOpen] = useState(false);
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
  const showFundPanel = (needsFunding || showAddCapacity) && !composerOpen;
  const showShareFlow = composerOpen && !poolUnavailable && !needsFunding;
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
    showShareFlow
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
      {composerOpen ? null : (
        <StorageSharePoolReadout
          label={SHARE_POOL_LABEL}
          summary={sharedPool}
          loading={sharedPoolLoading}
          error={sharedPoolError}
          errorMessage="Share pool unavailable right now."
          canAddCapacity={!needsFunding && !sharedPoolLoading}
          showAddCapacity={showAddCapacity}
          onToggleAddCapacity={() => {
            setShowAddCapacity((open) => !open);
          }}
          capacityHint="Pool capacity for accounts you sponsor."
        />
      )}

      {showFundPanel ? (
        <div className="app-storage-share-fund">
          <p className="app-storage-meta">
            Add NEAR to @{accountId}&apos;s share pool.
          </p>
          <AmountField
            value={fundAmountInput}
            onValueChange={applyFundAmountInput}
            maxDecimals={STORAGE_NEAR_INPUT_DECIMALS}
            placeholder={amountHint}
            aria-label="Share pool fund amount in NEAR"
            invalid={Boolean(fundAmountInput) && !canFundAmount}
            unit="NEAR"
          />
          <AmountFieldMetaRow
            presets={STORAGE_SHARE_POOL_DEPOSIT_PRESETS_NEAR}
            selectedValue={normalizedFundAmount}
            onSelectPreset={applyFundAmountInput}
            presetsAriaLabel="Quick fund amounts"
            meta={
              <>
                {fundPreviewCapacityBytes != null &&
                fundPreviewCapacityBytes > 0 ? (
                  <>≈ {formatCompactBytes(fundPreviewCapacityBytes)} · </>
                ) : null}
                {walletNearYocto != null ? (
                  <>
                    Balance {formatNearCompact(walletNearYocto.toString())} ·{' '}
                  </>
                ) : null}
                Min {amountHint}
              </>
            }
          />
          {error ? (
            <p className="app-storage-error" role="alert">
              {error}
            </p>
          ) : null}
          <OsSheetActions layout="stack" tone="frosted-primary" borderless>
            <OsSheetAction
              type="button"
              ready={!pending && canFundAmount && !error}
              pending={pending}
              pendingLabel="Adding…"
              disabled={pending || !canFundAmount}
              onClick={() => void handleFundPool()}
            >
              {needsFunding ? 'Fund share pool' : 'Add to share pool'}
            </OsSheetAction>
          </OsSheetActions>
          <p className="app-storage-hint app-storage-hint--compact">
            {USER_STORAGE_SHARE_POOL_DEPOSIT_HINT}
          </p>
        </div>
      ) : null}

      {!needsFunding &&
      !poolUnavailable &&
      !sharedPoolLoading &&
      !composerOpen ? (
        <button
          type="button"
          className="os-surface-row os-surface-row--navigate app-storage-choice"
          onClick={() => {
            setShowAddCapacity(false);
            setComposerOpen(true);
          }}
        >
          <span className="os-surface-row-copy">
            <span className="os-surface-row-label">Share with accounts</span>
            <span className="os-surface-row-description">
              {USER_STORAGE_SHARE_HINT}
            </span>
          </span>
          <ChevronRightIcon aria-hidden className="os-surface-row-arrow" />
        </button>
      ) : null}

      {showShareFlow ? (
        <div className="app-storage-share-flow">
          <button
            type="button"
            className="app-storage-back"
            onClick={() => setComposerOpen(false)}
          >
            <ChevronLeftIcon aria-hidden className="app-storage-back-icon" />
            Share pool
          </button>
          <div className="app-storage-share-recipients">
            <div className="app-storage-share-card-head">
              <span className="account-card-wallet-label">Recipients</span>
              <button
                type="button"
                className="app-storage-share-link os-disabled-ink"
                onClick={addRow}
                disabled={rows.length >= MAX_STORAGE_SHARE_RECIPIENTS}
              >
                <PlusIcon aria-hidden className="app-storage-share-add-icon" />
                Add
              </button>
            </div>
            {rows.map((row, index) => {
              const status = recipientValidation.statuses[index] ?? 'empty';
              return (
                <StorageShareRecipientRow
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
            <StorageShareSplitVisual
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
            <OsSheetAction
              type="button"
              ready={!pending && canShare && !error}
              pending={pending}
              pendingLabel="Sharing…"
              disabled={pending || !canShare}
              onClick={() => void handleShare()}
            >
              Share storage
            </OsSheetAction>
          </OsSheetActions>
          <p className="app-storage-hint app-storage-hint--compact">
            {USER_STORAGE_SHARE_HINT}
          </p>
        </div>
      ) : null}

      {composerOpen ? null : (
        <StorageShareGrantsReadout
          label="Shared with"
          grants={activeShares.grants}
          loading={activeShares.loading}
          error={activeShares.error}
          errorMessage="Active shares unavailable right now."
        />
      )}
    </div>
  );
}
