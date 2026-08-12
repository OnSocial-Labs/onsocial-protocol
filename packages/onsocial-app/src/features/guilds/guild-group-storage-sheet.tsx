'use client';

import { useCallback, useEffect, useId, useMemo, useState } from 'react';
import {
  Divider,
  GlassSheet,
  MultiplyIcon,
  OsSheetActions,
  OsSheetPrimaryAction,
  PlusIcon,
  SheetCloseButton,
} from '@onsocial/ui';
import { useAppTransactionFeedback } from '@/contexts/app-transaction-feedback-context';
import { useAppWallet } from '@/contexts/app-wallet-context';
import { useGroupStoragePool } from '@/hooks/use-group-storage-pool';
import { useScrollLock } from '@/hooks/use-scroll-lock';
import { useWalletNearBalance } from '@/hooks/use-wallet-near-balance';
import { finalizeAmountInput } from '@/lib/amount-input';
import {
  isNearAccountInputReady,
  nearAccountPlaceholder,
  normalizeNearAccountId,
  sanitizeNearAccountInput,
} from '@/lib/app-near-account';
import {
  sendGroupPoolDepositTransaction,
  sendGroupSponsorQuotaBatchTransaction,
} from '@/lib/app-storage-transactions';
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
  splitShareBytesPerRecipient,
  storageCapacityBytesFromNearInput,
  STORAGE_NEAR_INPUT_DECIMALS,
  STORAGE_SHARE_PERCENT_PRESETS,
  STORAGE_SHARE_POOL_DEPOSIT_MIN_YOCTO,
  STORAGE_SHARE_POOL_DEPOSIT_PRESETS_NEAR,
} from '@/lib/user-storage-display';
import { isWalletUserCancellation } from '@/lib/wallet-errors';
import {
  txToastConfirming,
  txToastError,
  txToastSuccess,
} from '@/lib/transaction-toast-copy';

const GROUP_STORAGE_LABEL = 'Group storage';

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

export function GuildGroupStorageSheet({
  open,
  groupId,
  guildName,
  onClose,
}: {
  open: boolean;
  groupId: string;
  guildName?: string;
  onClose: () => void;
}) {
  const titleId = useId();
  const [closing, setClosing] = useState(false);
  const sheetOpen = open && !closing;
  const { accountId, getSigningWallet } = useAppWallet();
  const { trackTransaction } = useAppTransactionFeedback();
  const [refreshKey, setRefreshKey] = useState(0);
  const pool = useGroupStoragePool(groupId, sheetOpen, refreshKey);
  const walletNear = useWalletNearBalance(accountId, sheetOpen, refreshKey);
  const walletNearYocto = walletNear.balanceYocto;

  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showAddCapacity, setShowAddCapacity] = useState(false);
  const [fundAmountInput, setFundAmountInput] = useState('');
  const [rows, setRows] = useState<string[]>(['']);
  const [sharePercent, setSharePercent] = useState(50);

  useScrollLock(open || closing);

  useEffect(() => {
    if (!sheetOpen) {
      setPending(false);
      setError(null);
      setShowAddCapacity(false);
      setFundAmountInput('');
      setRows(['']);
      setSharePercent(50);
    }
  }, [sheetOpen]);

  const requestClose = useCallback(() => {
    if (closing || pending) return;
    setClosing(true);
  }, [closing, pending]);

  const handleClosed = useCallback(() => {
    setClosing(false);
    onClose();
  }, [onClose]);

  const summary = pool.summary;
  const needsFunding =
    !pool.loading &&
    !pool.error &&
    (summary?.totalCapacityBytes ?? 0) <= 0;
  const showFundPanel = needsFunding || showAddCapacity;

  const shareBudgetBytes = resolveSharePoolBudgetBytes({
    availableBytes: summary?.availableBytes ?? 0,
    sharedBytes: summary?.sharedBytes ?? 0,
    totalCapacityBytes: summary?.totalCapacityBytes ?? 0,
  });

  const readyRecipients = useMemo(() => {
    const ids: string[] = [];
    for (const row of rows) {
      if (!isNearAccountInputReady(row)) continue;
      const normalized = normalizeNearAccountId(row);
      if (!normalized || normalized === accountId) continue;
      if (ids.includes(normalized)) continue;
      ids.push(normalized);
    }
    return ids;
  }, [accountId, rows]);

  const bytesPerRecipient = splitShareBytesPerRecipient(
    shareBudgetBytes,
    Math.max(1, readyRecipients.length),
    sharePercent
  );
  const canGrant =
    !pending &&
    !needsFunding &&
    readyRecipients.length > 0 &&
    isValidShareBytesPerRecipient(bytesPerRecipient);

  const applyFundAmountInput = (value: string) => {
    setFundAmountInput(
      clampStorageNearAmountInput(value, {
        maxYocto: walletNearYocto ?? undefined,
      })
    );
  };

  const canFundAmount = isValidStorageAmountInput(fundAmountInput, 'deposit', {
    minYocto: STORAGE_SHARE_POOL_DEPOSIT_MIN_YOCTO,
    maxYocto: walletNearYocto ?? undefined,
  });

  const refreshAfterTx = () => setRefreshKey((key) => key + 1);

  const handleFundPool = async () => {
    if (!accountId) return;
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
      setError(err instanceof Error ? err.message : 'Invalid amount.');
      return;
    }

    setError(null);
    setPending(true);
    try {
      const txHashes = await sendGroupPoolDepositTransaction(
        getSigningWallet,
        groupId,
        amountYocto.toString()
      );
      const confirmed = await trackTransaction({
        txHashes,
        submittedMessage: txToastConfirming.fundingGroupStorage,
        successMessage: txToastSuccess.groupStorageFunded,
        failureMessage: txToastError.groupStorageFundFailed,
        onFailure: (message) => setError(message),
      });
      if (!confirmed) return;
    } catch (err) {
      if (isWalletUserCancellation(err)) return;
      setError(
        err instanceof Error
          ? err.message
          : txToastError.groupStorageFundFailed
      );
      return;
    } finally {
      setPending(false);
    }

    setShowAddCapacity(false);
    setFundAmountInput('');
    refreshAfterTx();
  };

  const handleGrant = async () => {
    if (!canGrant) return;
    setError(null);
    setPending(true);
    try {
      const txHashes = await sendGroupSponsorQuotaBatchTransaction(
        getSigningWallet,
        groupId,
        readyRecipients.map((targetAccountId) => ({
          targetAccountId,
          maxBytes: bytesPerRecipient,
        }))
      );
      const confirmed = await trackTransaction({
        txHashes,
        submittedMessage: txToastConfirming.grantingGroupStorage,
        successMessage: txToastSuccess.groupStorageGranted,
        failureMessage: txToastError.groupStorageGrantFailed,
        onFailure: (message) => setError(message),
      });
      if (!confirmed) return;
    } catch (err) {
      if (isWalletUserCancellation(err)) return;
      setError(
        err instanceof Error
          ? err.message
          : txToastError.groupStorageGrantFailed
      );
      return;
    } finally {
      setPending(false);
    }

    setRows(['']);
    refreshAfterTx();
  };

  const amountHint = formatStorageMinNearLabel(
    STORAGE_SHARE_POOL_DEPOSIT_MIN_YOCTO
  );
  const totalShareBytes = bytesPerRecipient * readyRecipients.length;
  const allocatedPercent =
    (summary?.totalCapacityBytes ?? 0) > 0
      ? Math.min(
          100,
          Math.round(
            ((summary?.sharedBytes ?? 0) / (summary?.totalCapacityBytes ?? 1)) *
              100
          )
        )
      : 0;

  return (
    <GlassSheet
      open={sheetOpen}
      onClose={requestClose}
      onClosed={handleClosed}
      tone="os"
      initialDetent="peek"
      zIndex={58}
      presentation="swap"
      ariaLabelledBy={titleId}
      backdropLabel="Close group storage"
      panelClassName="guild-settings-sheet-panel"
      bodyClassName="guild-settings-sheet-body app-storage-sheet-body"
      header={
        <>
          <div className="standing-sheet-header guild-settings-sheet-header">
            <div className="standing-sheet-subject-row">
              <div className="standing-sheet-subject">
                <div className="standing-sheet-subject-copy">
                  <h2 id={titleId} className="standing-sheet-subject-name">
                    Group storage
                  </h2>
                  <p className="discover-sheet-subtitle">
                    {guildName?.trim()
                      ? `Fund the pool and add storage for ${guildName.trim()} members`
                      : 'Fund the pool and add storage for members'}
                  </p>
                </div>
              </div>
              <div className="standing-sheet-actions">
                <SheetCloseButton
                  onClick={requestClose}
                  ariaLabel="Close"
                />
              </div>
            </div>
          </div>
          <Divider variant="section" className="glass-sheet-header-divider" />
        </>
      }
      footer={
        showFundPanel ? (
          <OsSheetActions>
            <OsSheetPrimaryAction
              type="button"
              disabled={pending || !canFundAmount || !accountId}
              onClick={() => void handleFundPool()}
            >
              {pending ? 'Confirming…' : 'Fund group pool'}
            </OsSheetPrimaryAction>
          </OsSheetActions>
        ) : (
          <OsSheetActions>
            <OsSheetPrimaryAction
              type="button"
              disabled={!canGrant || !accountId}
              onClick={() => void handleGrant()}
            >
              {pending
                ? 'Confirming…'
                : readyRecipients.length > 1
                  ? `Add storage · ${readyRecipients.length}`
                  : 'Add storage'}
            </OsSheetPrimaryAction>
          </OsSheetActions>
        )
      }
    >
      <div className="app-storage-share-panel">
        {!accountId ? (
          <p className="protocol-empty">Connect a wallet to manage storage.</p>
        ) : null}

        {accountId && pool.loading ? (
          <div className="app-storage-share-card is-loading" aria-hidden>
            <span className="account-wallet-progress-track is-loading" />
          </div>
        ) : null}

        {accountId && pool.error ? (
          <div className="app-storage-share-card">
            <span className="account-card-wallet-label">
              {GROUP_STORAGE_LABEL}
            </span>
            <p className="app-storage-meta">
              Group storage unavailable right now.
            </p>
          </div>
        ) : null}

        {accountId && !pool.loading && !pool.error ? (
          <div className="app-storage-share-card">
            <div className="app-storage-share-card-head">
              <span className="account-card-wallet-label">
                {GROUP_STORAGE_LABEL}
              </span>
              {!needsFunding ? (
                <button
                  type="button"
                  className="app-storage-share-link"
                  onClick={() => setShowAddCapacity((open) => !open)}
                  disabled={pending}
                >
                  {showAddCapacity ? 'Cancel' : 'Add NEAR'}
                </button>
              ) : null}
            </div>
            {needsFunding ? (
              <p className="app-storage-meta">
                Fund the group pool to add storage for members.
              </p>
            ) : (
              <>
                <div className="app-storage-share-hero">
                  <p className="app-storage-share-available">
                    <CompactByteAmount bytes={shareBudgetBytes} />
                    <span className="app-storage-share-muted"> available</span>
                  </p>
                  <p className="app-storage-meta">
                    {formatNearCompact(
                      (summary?.storageBalanceYocto ?? 0n).toString()
                    )}{' '}
                    NEAR in pool · {allocatedPercent}% assigned
                  </p>
                </div>
                <div
                  className="app-storage-share-split-track"
                  aria-hidden
                >
                  <span
                    className="app-storage-share-split-fill"
                    style={{ width: `${Math.max(allocatedPercent, 0)}%` }}
                  />
                </div>
              </>
            )}
          </div>
        ) : null}

        {accountId && showFundPanel ? (
          <div className="app-storage-share-fund">
            <p className="app-storage-meta">
              Add NEAR to this guild&apos;s shared storage pool.
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
                aria-label="Group pool fund amount in NEAR"
                aria-invalid={Boolean(fundAmountInput) && !canFundAmount}
                className="app-storage-amount-input"
                disabled={pending}
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
                    className={`os-surface-chip${
                      finalizeAmountInput(
                        fundAmountInput,
                        STORAGE_NEAR_INPUT_DECIMALS
                      ) === preset
                        ? ' is-selected'
                        : ''
                    }`}
                    onClick={() => applyFundAmountInput(preset)}
                    disabled={pending}
                  >
                    {preset}
                  </button>
                ))}
              </div>
            </div>
            {fundAmountInput ? (
              <p className="app-storage-meta">
                ≈{' '}
                <CompactByteAmount
                  bytes={
                    storageCapacityBytesFromNearInput(fundAmountInput) ?? 0
                  }
                />{' '}
                capacity
              </p>
            ) : null}
          </div>
        ) : null}

        {accountId && !showFundPanel && !needsFunding ? (
          <div className="app-storage-share-flow">
            <div className="app-storage-share-recipients">
              <div className="app-storage-share-card-head">
                <span className="account-card-wallet-label">Members</span>
                <button
                  type="button"
                  className="app-storage-share-link"
                  onClick={() =>
                    setRows((current) =>
                      current.length >= MAX_STORAGE_SHARE_RECIPIENTS
                        ? current
                        : [...current, '']
                    )
                  }
                  disabled={
                    pending || rows.length >= MAX_STORAGE_SHARE_RECIPIENTS
                  }
                >
                  <PlusIcon className="app-storage-share-add-icon" />
                  Add
                </button>
              </div>
              {rows.map((row, index) => (
                <div key={`recipient-${index}`} className="app-storage-amount-field">
                  <label
                    className="sr-only"
                    htmlFor={`group-storage-recipient-${index}`}
                  >
                    Member account {index + 1}
                  </label>
                  <input
                    id={`group-storage-recipient-${index}`}
                    type="text"
                    autoCapitalize="none"
                    autoCorrect="off"
                    spellCheck={false}
                    value={row}
                    placeholder={nearAccountPlaceholder()}
                    onChange={(event) => {
                      const next = sanitizeNearAccountInput(event.target.value);
                      setRows((current) =>
                        current.map((value, rowIndex) =>
                          rowIndex === index ? next : value
                        )
                      );
                    }}
                    className="app-storage-amount-input"
                    disabled={pending}
                  />
                  {rows.length > 1 ? (
                    <button
                      type="button"
                      className="app-storage-share-link"
                      aria-label={`Remove member ${index + 1}`}
                      onClick={() =>
                        setRows((current) =>
                          current.length <= 1
                            ? current
                            : current.filter((_, rowIndex) => rowIndex !== index)
                        )
                      }
                      disabled={pending}
                    >
                      <MultiplyIcon className="app-storage-share-add-icon" />
                    </button>
                  ) : null}
                </div>
              ))}
            </div>

            <div className="app-storage-share-split-controls">
              <p className="app-storage-meta">
                Split available pool across selected members.
              </p>
              <div
                className="app-storage-presets"
                role="group"
                aria-label="Storage share percent"
              >
                {STORAGE_SHARE_PERCENT_PRESETS.map((percent) => (
                  <button
                    key={percent}
                    type="button"
                    className={`os-surface-chip${
                      sharePercent === percent ? ' is-selected' : ''
                    }`}
                    onClick={() => setSharePercent(percent)}
                    disabled={pending}
                  >
                    {percent}%
                  </button>
                ))}
              </div>
              {readyRecipients.length > 0 ? (
                <p className="app-storage-meta">
                  <CompactByteAmount bytes={bytesPerRecipient} /> each
                  {readyRecipients.length > 1 ? (
                    <>
                      {' '}
                      · <CompactByteAmount bytes={totalShareBytes} /> total
                    </>
                  ) : null}
                  {bytesPerRecipient > 0 &&
                  bytesPerRecipient < MIN_SHARED_STORAGE_BYTES ? (
                    <span className="app-storage-meta is-low">
                      {' '}
                      · need at least{' '}
                      <CompactByteAmount bytes={MIN_SHARED_STORAGE_BYTES} /> each
                    </span>
                  ) : null}
                </p>
              ) : null}
            </div>
          </div>
        ) : null}

        {error ? (
          <p className="app-storage-error" role="alert">
            {error}
          </p>
        ) : null}
      </div>
    </GlassSheet>
  );
}
