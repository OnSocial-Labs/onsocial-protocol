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
import { useGroupStorageGrants } from '@/hooks/use-group-storage-grants';
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
  sendGroupSponsorDefaultTransaction,
  sendGroupSponsorQuotaBatchTransaction,
  sendGroupSponsorQuotaDisableTransaction,
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
  type ActiveStorageShareGrant,
} from '@/lib/user-storage-display';
import { isWalletUserCancellation } from '@/lib/wallet-errors';
import {
  txToastConfirming,
  txToastError,
  txToastSuccess,
} from '@/lib/transaction-toast-copy';

const GROUP_STORAGE_LABEL = 'Group storage';
const GROUP_STORAGE_FUND_HINT = 'Group pools start at 0.1 NEAR.';
const GROUP_STORAGE_GRANT_HINT =
  'Members write guild content from this pool.';
const GROUP_STORAGE_DEFAULT_HINT =
  'Applies to members without a personal grant.';

type RecipientRowStatus =
  | 'empty'
  | 'invalid'
  | 'self'
  | 'duplicate'
  | 'ready';

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

function recipientIssueMessage(status: RecipientRowStatus): string | null {
  switch (status) {
    case 'invalid':
      return 'Use a complete NEAR account.';
    case 'self':
      return 'You cannot grant yourself group storage.';
    case 'duplicate':
      return 'Already in the list.';
    default:
      return null;
  }
}

function GroupPoolReadout({
  loading,
  error,
  needsFunding,
  shareBudgetBytes,
  storageBalanceYocto,
  allocatedPercent,
  showAddCapacity,
  canAddCapacity,
  onToggleAddCapacity,
}: {
  loading: boolean;
  error: string | null;
  needsFunding: boolean;
  shareBudgetBytes: number;
  storageBalanceYocto: bigint;
  allocatedPercent: number;
  showAddCapacity: boolean;
  canAddCapacity: boolean;
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
        <span className="account-card-wallet-label">{GROUP_STORAGE_LABEL}</span>
        <p className="app-storage-meta">Group storage unavailable right now.</p>
      </div>
    );
  }

  const barFill =
    allocatedPercent > 0 ? Math.max(allocatedPercent, 4) : allocatedPercent;

  return (
    <div className="app-storage-share-card">
      <div className="app-storage-share-card-head">
        <span className="account-card-wallet-label">{GROUP_STORAGE_LABEL}</span>
        {canAddCapacity ? (
          <button
            type="button"
            className="app-storage-share-link"
            onClick={onToggleAddCapacity}
          >
            {showAddCapacity ? 'Cancel' : 'Add NEAR'}
          </button>
        ) : null}
      </div>
      {needsFunding ? (
        <p className="app-storage-meta">Not funded yet.</p>
      ) : (
        <>
          <div className="app-storage-share-hero">
            <p className="app-storage-share-available">
              <CompactByteAmount bytes={shareBudgetBytes} />
              <span className="app-storage-share-muted"> available</span>
            </p>
            <p className="app-storage-meta">
              {formatNearCompact(storageBalanceYocto.toString())} NEAR in pool
              · {allocatedPercent}% assigned
            </p>
          </div>
          <div className="app-storage-share-split-track" aria-hidden>
            <span
              className="app-storage-share-split-fill"
              style={{ width: `${barFill}%` }}
            />
          </div>
          <p className="app-storage-meta">
            Pool capacity for members who write in this guild.
          </p>
        </>
      )}
    </div>
  );
}

function MemberRecipientRow({
  rowId,
  value,
  status,
  allocationBytes,
  canRemove,
  disabled,
  onValueChange,
  onRemove,
}: {
  rowId: string;
  value: string;
  status: RecipientRowStatus;
  allocationBytes?: number | null;
  canRemove: boolean;
  disabled: boolean;
  onValueChange: (value: string) => void;
  onRemove: () => void;
}) {
  const issue = recipientIssueMessage(status);

  return (
    <div className="app-storage-recipient-row">
      <label className="sr-only" htmlFor={`group-storage-recipient-${rowId}`}>
        Member account
      </label>
      <input
        id={`group-storage-recipient-${rowId}`}
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
        disabled={disabled}
      />
      {allocationBytes != null && allocationBytes > 0 ? (
        <CompactByteAmount bytes={allocationBytes} />
      ) : null}
      {canRemove ? (
        <button
          type="button"
          className="app-storage-recipient-remove"
          onClick={onRemove}
          aria-label="Remove member"
          disabled={disabled}
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

function GroupSplitVisual({
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
            ? `${sharePercent === 100 ? 'Max' : `${sharePercent}%`} split · ${formatCompactBytes(totalShareBytes)} across ${readyCount} members`
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
          ? `Minimum is ${formatCompactBytes(MIN_SHARED_STORAGE_BYTES)} per member.`
          : showBytes
            ? `≈ ${formatCompactBytes(bytesPerRecipient)} each · ${formatCompactBytes(totalShareBytes)} total`
            : 'Choose members, then pick how much of the pool to assign.'}
      </p>
    </div>
  );
}

function GroupGrantRow({
  grant,
  pending,
  onRevoke,
}: {
  grant: ActiveStorageShareGrant;
  pending: boolean;
  onRevoke: (accountId: string) => void;
}) {
  return (
    <li className="app-storage-grant-row">
      <span className="app-storage-grant-account" title={`@${grant.accountId}`}>
        @{grant.accountId}
      </span>
      <span className="app-storage-grant-bytes">
        {grant.maxBytes > 0 ? (
          <CompactByteAmount bytes={grant.maxBytes} />
        ) : (
          <span className="app-storage-share-muted">Pending…</span>
        )}
      </span>
      <button
        type="button"
        className="app-storage-share-link"
        disabled={pending || grant.maxBytes <= 0}
        onClick={() => onRevoke(grant.accountId)}
      >
        Remove
      </button>
    </li>
  );
}

function GroupGrantsReadout({
  grants,
  loading,
  error,
  pending,
  onRevoke,
}: {
  grants: ActiveStorageShareGrant[];
  loading: boolean;
  error: string | null;
  pending: boolean;
  onRevoke: (accountId: string) => void;
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

  return (
    <div className="app-storage-grants">
      <div className="app-storage-grants-head">
        <span className="account-card-wallet-label">Granted to</span>
        {!error && grants.length > 0 ? (
          <span className="app-storage-grants-summary">
            {grants.length}
            {allocatedBytes > 0
              ? ` · ${formatCompactBytes(allocatedBytes)}`
              : ''}
          </span>
        ) : null}
      </div>

      {error ? (
        <p className="app-storage-meta">Active grants unavailable right now.</p>
      ) : (
        <ul className="app-storage-grants-list">
          {grants.map((grant) => (
            <GroupGrantRow
              key={grant.accountId}
              grant={grant}
              pending={pending}
              onRevoke={onRevoke}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

export function GuildGroupStorageSheet({
  open,
  groupId,
  guildName,
  initialRecipient = null,
  onClose,
}: {
  open: boolean;
  groupId: string;
  guildName?: string;
  initialRecipient?: string | null;
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
  const [showDefaultEditor, setShowDefaultEditor] = useState(false);
  const [fundAmountInput, setFundAmountInput] = useState('0.1');
  const [rows, setRows] = useState<string[]>(['']);
  const [sharePercent, setSharePercent] = useState(50);
  const [defaultPercent, setDefaultPercent] = useState(25);
  const [pendingGrantTargets, setPendingGrantTargets] = useState<string[]>([]);

  const activeGrants = useGroupStorageGrants(
    groupId,
    sheetOpen,
    refreshKey,
    pendingGrantTargets
  );

  useScrollLock(open || closing);

  useEffect(() => {
    if (!sheetOpen) {
      setPending(false);
      setError(null);
      setShowAddCapacity(false);
      setShowDefaultEditor(false);
      setFundAmountInput('0.1');
      setRows(['']);
      setSharePercent(50);
      setDefaultPercent(25);
      setPendingGrantTargets([]);
      return;
    }

    if (initialRecipient?.trim()) {
      setRows([sanitizeNearAccountInput(initialRecipient)]);
    }
  }, [initialRecipient, sheetOpen]);

  useEffect(() => {
    setError(null);
  }, [
    fundAmountInput,
    rows,
    sharePercent,
    defaultPercent,
    showAddCapacity,
    showDefaultEditor,
  ]);

  useEffect(() => {
    if (pendingGrantTargets.length === 0) return;
    const grantIds = new Set(
      activeGrants.grants
        .filter((grant) => grant.maxBytes > 0)
        .map((grant) => grant.accountId)
    );
    if (pendingGrantTargets.every((targetId) => grantIds.has(targetId))) {
      setPendingGrantTargets([]);
    }
  }, [activeGrants.grants, pendingGrantTargets]);

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
    !pool.loading && !pool.error && (summary?.totalCapacityBytes ?? 0) <= 0;
  const showFundPanel = needsFunding || showAddCapacity;
  const showGrantFlow = !showFundPanel && !needsFunding && !pool.loading;

  const shareBudgetBytes = resolveSharePoolBudgetBytes({
    availableBytes: summary?.availableBytes ?? 0,
    sharedBytes: summary?.sharedBytes ?? 0,
    totalCapacityBytes: summary?.totalCapacityBytes ?? 0,
  });

  const recipientStatuses = useMemo((): RecipientRowStatus[] => {
    const normalized = rows.map((row) => normalizeNearAccountId(row));
    return rows.map((row, index) => {
      if (!row.trim()) return 'empty';
      if (!isNearAccountInputReady(row)) return 'invalid';
      const id = normalized[index]!;
      if (accountId && id === accountId) return 'self';
      if (normalized.filter((entry) => entry === id).length > 1) {
        return 'duplicate';
      }
      return 'ready';
    });
  }, [accountId, rows]);

  const readyRecipients = useMemo(
    () =>
      recipientStatuses
        .map((status, index) =>
          status === 'ready' ? normalizeNearAccountId(rows[index]!) : null
        )
        .filter((id): id is string => Boolean(id)),
    [recipientStatuses, rows]
  );

  const bytesPerRecipient = splitShareBytesPerRecipient(
    shareBudgetBytes,
    Math.max(1, readyRecipients.length),
    sharePercent
  );
  const defaultMaxBytes = splitShareBytesPerRecipient(
    shareBudgetBytes,
    1,
    defaultPercent
  );
  const canGrant =
    Boolean(accountId) &&
    !pending &&
    !needsFunding &&
    readyRecipients.length > 0 &&
    isValidShareBytesPerRecipient(bytesPerRecipient);
  const canSetDefault =
    Boolean(accountId) &&
    !pending &&
    !needsFunding &&
    isValidShareBytesPerRecipient(defaultMaxBytes);

  const normalizedFundAmount = useMemo(
    () => finalizeAmountInput(fundAmountInput, STORAGE_NEAR_INPUT_DECIMALS),
    [fundAmountInput]
  );
  const fundPreviewCapacityBytes =
    storageCapacityBytesFromNearInput(normalizedFundAmount);
  const canFundAmount = isValidStorageAmountInput(
    normalizedFundAmount,
    'deposit',
    {
      minYocto: STORAGE_SHARE_POOL_DEPOSIT_MIN_YOCTO,
      maxYocto: walletNearYocto ?? undefined,
    }
  );

  const applyFundAmountInput = useCallback(
    (value: string) => {
      setFundAmountInput(
        clampStorageNearAmountInput(value, {
          maxYocto: walletNearYocto ?? undefined,
        })
      );
    },
    [walletNearYocto]
  );

  const refreshAfterTx = () => setRefreshKey((key) => key + 1);
  const defaultQuota = activeGrants.defaultQuota;
  const defaultEnabled = Boolean(
    defaultQuota?.enabled && defaultQuota.maxBytes > 0
  );

  const handleFundPool = async () => {
    if (!accountId) return;
    let amountYocto: bigint;
    try {
      amountYocto = parseStorageAmountYocto(normalizedFundAmount, 'deposit', {
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
    setFundAmountInput('0.1');
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
      setPendingGrantTargets((current) => [
        ...new Set([...current, ...readyRecipients]),
      ]);
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

  const handleSetDefault = async () => {
    if (!canSetDefault) return;
    setError(null);
    setPending(true);
    try {
      const txHashes = await sendGroupSponsorDefaultTransaction(
        getSigningWallet,
        groupId,
        {
          enabled: true,
          allowanceMaxBytes: defaultMaxBytes,
          dailyRefillBytes: 0,
        }
      );
      const confirmed = await trackTransaction({
        txHashes,
        submittedMessage: txToastConfirming.settingGroupStorageDefault,
        successMessage: txToastSuccess.groupStorageDefaultSet,
        failureMessage: txToastError.groupStorageDefaultFailed,
        onFailure: (message) => setError(message),
      });
      if (!confirmed) return;
    } catch (err) {
      if (isWalletUserCancellation(err)) return;
      setError(
        err instanceof Error
          ? err.message
          : txToastError.groupStorageDefaultFailed
      );
      return;
    } finally {
      setPending(false);
    }

    setShowDefaultEditor(false);
    refreshAfterTx();
  };

  const handleClearDefault = async () => {
    if (!accountId || pending) return;
    setError(null);
    setPending(true);
    try {
      const txHashes = await sendGroupSponsorDefaultTransaction(
        getSigningWallet,
        groupId,
        { enabled: false, allowanceMaxBytes: 0, dailyRefillBytes: 0 }
      );
      const confirmed = await trackTransaction({
        txHashes,
        submittedMessage: txToastConfirming.settingGroupStorageDefault,
        successMessage: txToastSuccess.groupStorageDefaultSet,
        failureMessage: txToastError.groupStorageDefaultFailed,
        onFailure: (message) => setError(message),
      });
      if (!confirmed) return;
    } catch (err) {
      if (isWalletUserCancellation(err)) return;
      setError(
        err instanceof Error
          ? err.message
          : txToastError.groupStorageDefaultFailed
      );
      return;
    } finally {
      setPending(false);
    }

    setShowDefaultEditor(false);
    refreshAfterTx();
  };

  const handleRevoke = async (targetAccountId: string) => {
    if (!accountId || pending) return;
    setError(null);
    setPending(true);
    try {
      const txHashes = await sendGroupSponsorQuotaDisableTransaction(
        getSigningWallet,
        groupId,
        targetAccountId
      );
      const confirmed = await trackTransaction({
        txHashes,
        submittedMessage: txToastConfirming.revokingGroupStorage,
        successMessage: txToastSuccess.groupStorageRevoked,
        failureMessage: txToastError.groupStorageRevokeFailed,
        onFailure: (message) => setError(message),
      });
      if (!confirmed) return;
    } catch (err) {
      if (isWalletUserCancellation(err)) return;
      setError(
        err instanceof Error
          ? err.message
          : txToastError.groupStorageRevokeFailed
      );
      return;
    } finally {
      setPending(false);
    }

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
      panelClassName="account-storage-panel"
      bodyClassName="account-storage-body"
      header={
        <>
          <div className="standing-sheet-header account-storage-header">
            <div className="standing-sheet-subject-row">
              <div className="standing-sheet-subject">
                <div className="standing-sheet-subject-copy">
                  <h2 id={titleId} className="standing-sheet-subject-name">
                    Group storage
                  </h2>
                  <p className="account-drawer-handle">
                    {guildName?.trim() || 'Guild pool and member grants'}
                  </p>
                </div>
              </div>
              <div className="standing-sheet-actions">
                <SheetCloseButton onClick={requestClose} ariaLabel="Close" />
              </div>
            </div>
          </div>
          <Divider variant="section" className="glass-sheet-header-divider" />
        </>
      }
    >
      <div className="app-storage-sheet">
        <div className="app-storage-share-panel">
          {!accountId ? (
            <p className="app-storage-meta">
              Connect a wallet to manage group storage.
            </p>
          ) : null}

          {accountId ? (
            <GroupPoolReadout
              loading={pool.loading}
              error={pool.error}
              needsFunding={needsFunding}
              shareBudgetBytes={shareBudgetBytes}
              storageBalanceYocto={summary?.storageBalanceYocto ?? 0n}
              allocatedPercent={allocatedPercent}
              showAddCapacity={showAddCapacity}
              canAddCapacity={!needsFunding && !pool.loading && !pool.error}
              onToggleAddCapacity={() => {
                setShowAddCapacity((openPanel) => !openPanel);
              }}
            />
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
                  onChange={(event) =>
                    applyFundAmountInput(event.target.value)
                  }
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
                        normalizedFundAmount === preset ? ' is-selected' : ''
                      }`}
                      onClick={() => applyFundAmountInput(preset)}
                      disabled={pending}
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
                    <>
                      Balance {formatNearCompact(walletNearYocto.toString())} ·{' '}
                    </>
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
                  {needsFunding ? 'Fund group pool' : 'Add to group pool'}
                </OsSheetPrimaryAction>
              </OsSheetActions>
              <p className="app-storage-hint app-storage-hint--compact">
                {GROUP_STORAGE_FUND_HINT}
              </p>
            </div>
          ) : null}

          {accountId && showGrantFlow ? (
            <div className="app-storage-share-flow">
              <div className="app-storage-share-card">
                <div className="app-storage-share-card-head">
                  <span className="account-card-wallet-label">
                    Default for members
                  </span>
                  <button
                    type="button"
                    className="app-storage-share-link"
                    onClick={() =>
                      setShowDefaultEditor((current) => !current)
                    }
                    disabled={pending}
                  >
                    {showDefaultEditor
                      ? 'Cancel'
                      : defaultEnabled
                        ? 'Edit'
                        : 'Set'}
                  </button>
                </div>
                {!showDefaultEditor ? (
                  <p className="app-storage-meta">
                    {defaultEnabled && defaultQuota
                      ? `${formatCompactBytes(defaultQuota.maxBytes)} for members without a personal grant.`
                      : 'No default yet. Members need a personal grant.'}
                  </p>
                ) : (
                  <>
                    <div
                      className="app-storage-presets"
                      role="group"
                      aria-label="Default member storage percent"
                    >
                      {STORAGE_SHARE_PERCENT_PRESETS.map((preset) => (
                        <button
                          key={preset}
                          type="button"
                          className={`os-surface-chip${
                            defaultPercent === preset ? ' is-selected' : ''
                          }`}
                          onClick={() => setDefaultPercent(preset)}
                          disabled={pending}
                        >
                          {preset === 100 ? 'Max' : `${preset}%`}
                        </button>
                      ))}
                    </div>
                    <p className="app-storage-meta">
                      {formatCompactBytes(defaultMaxBytes)} per member without a
                      personal grant.
                    </p>
                    <OsSheetActions
                      layout="stack"
                      tone="frosted-primary"
                      borderless
                    >
                      <OsSheetPrimaryAction
                        type="button"
                        ready={!pending && canSetDefault && !error}
                        pending={pending}
                        pendingLabel="Saving…"
                        disabled={pending || !canSetDefault}
                        onClick={() => void handleSetDefault()}
                      >
                        Save default
                      </OsSheetPrimaryAction>
                    </OsSheetActions>
                    {defaultEnabled ? (
                      <button
                        type="button"
                        className="app-storage-share-link"
                        disabled={pending}
                        onClick={() => void handleClearDefault()}
                      >
                        Turn off default
                      </button>
                    ) : null}
                    <p className="app-storage-hint app-storage-hint--compact">
                      {GROUP_STORAGE_DEFAULT_HINT}
                    </p>
                  </>
                )}
              </div>

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
                    <PlusIcon
                      aria-hidden
                      className="app-storage-share-add-icon"
                    />
                    Add
                  </button>
                </div>
                {rows.map((row, index) => {
                  const status = recipientStatuses[index] ?? 'empty';
                  return (
                    <MemberRecipientRow
                      key={`member-${index}`}
                      rowId={String(index)}
                      value={row}
                      status={status}
                      allocationBytes={
                        status === 'ready' && bytesPerRecipient > 0
                          ? bytesPerRecipient
                          : null
                      }
                      canRemove={rows.length > 1}
                      disabled={pending}
                      onValueChange={(value) =>
                        setRows((current) =>
                          current.map((entry, rowIndex) =>
                            rowIndex === index ? value : entry
                          )
                        )
                      }
                      onRemove={() =>
                        setRows((current) =>
                          current.length <= 1
                            ? current
                            : current.filter(
                                (_, rowIndex) => rowIndex !== index
                              )
                        )
                      }
                    />
                  );
                })}
              </div>

              <div className="app-storage-share-split-controls">
                <div
                  className="app-storage-presets"
                  role="group"
                  aria-label="Group storage percent"
                >
                  {STORAGE_SHARE_PERCENT_PRESETS.map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      className={`os-surface-chip${
                        sharePercent === preset ? ' is-selected' : ''
                      }`}
                      onClick={() => setSharePercent(preset)}
                      disabled={pending}
                    >
                      {preset === 100 ? 'Max' : `${preset}%`}
                    </button>
                  ))}
                </div>
                <GroupSplitVisual
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
                  ready={!pending && canGrant && !error}
                  pending={pending}
                  pendingLabel="Adding…"
                  disabled={pending || !canGrant}
                  onClick={() => void handleGrant()}
                >
                  {readyRecipients.length > 1
                    ? `Add storage · ${readyRecipients.length}`
                    : 'Add storage'}
                </OsSheetPrimaryAction>
              </OsSheetActions>
              <p className="app-storage-hint app-storage-hint--compact">
                {GROUP_STORAGE_GRANT_HINT}
              </p>

              <GroupGrantsReadout
                grants={activeGrants.grants}
                loading={activeGrants.loading}
                error={activeGrants.error}
                pending={pending}
                onRevoke={(targetId) => void handleRevoke(targetId)}
              />
            </div>
          ) : null}
        </div>
      </div>
    </GlassSheet>
  );
}
