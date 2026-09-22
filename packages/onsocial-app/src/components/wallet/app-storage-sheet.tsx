'use client';

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
  type FormEvent,
} from 'react';
import {
  AmountFieldMetaRow,
  ChevronLeftIcon,
  ChevronRightIcon,
  OsHugSheet,
  OsSheetAction,
  OsSheetActions,
  standingIdentityAccountCopy,
} from '@onsocial/ui';
import { AmountField } from '@onsocial/ui';
import { AppStorageSharePanel } from '@/components/wallet/app-storage-share-panel';
import { usePlatformStorageSummary } from '@/hooks/use-platform-storage-summary';
import { useSharedStoragePool } from '@/hooks/use-shared-storage-pool';
import { useUserStorageBalance } from '@/hooks/use-user-storage-balance';
import { useWalletNearBalance } from '@/hooks/use-wallet-near-balance';
import { useAppTransactionFeedback } from '@/contexts/app-transaction-feedback-context';
import { useAppWallet } from '@/contexts/app-wallet-context';
import { finalizeAmountInput } from '@/lib/amount-input';
import { yoctoToNear } from '@/lib/app-near-rpc';
import {
  sendStorageDepositTransaction,
  sendStorageWithdrawTransaction,
} from '@/lib/app-storage-transactions';
import { formatNearCompact } from '@/lib/format-near-balance';
import {
  formatCompactBytes,
  formatPlatformStorageStatusLine,
  PLATFORM_STORAGE_LABEL,
  type PlatformStorageSummary,
} from '@/lib/platform-storage-display';
import { SHEET_Z } from '@/lib/sheet-z';
import {
  clampStorageNearAmountInput,
  formatStorageMinNearLabel,
  isValidStorageAmountInput,
  parseStorageAmountYocto,
  STORAGE_DEPOSIT_MIN_YOCTO,
  STORAGE_DEPOSIT_PRESETS_NEAR,
  STORAGE_NEAR_INPUT_DECIMALS,
  storageCapacityBytesFromNearInput,
  storageCapacityBytesFromYocto,
  storageManageIsHighlighted,
  USER_STORAGE_DEPOSIT_HINT,
  USER_STORAGE_LABEL,
  USER_STORAGE_SHARE_HINT,
  USER_STORAGE_WITHDRAW_HINT,
  type UserStorageSummary,
} from '@/lib/user-storage-display';
import { isWalletUserCancellation } from '@/lib/wallet-errors';
import {
  txToastConfirming,
  txToastError,
  txToastSuccess,
} from '@/lib/transaction-toast-copy';

type StorageSheetView = 'status' | 'deposit' | 'withdraw' | 'share';

interface AppStorageSheetProps {
  open: boolean;
  accountId: string;
  pageMoodId?: string | null;
  panelStyle?: CSSProperties;
  refreshKey?: number;
  onClose: () => void;
  onClosed?: () => void;
  onStorageChanged?: () => void;
}

function UserStorageReadout({ summary }: { summary: UserStorageSummary }) {
  const low = summary.effectiveBytes > 0 && summary.headroomPercent <= 25;
  const balanceLabel = formatNearCompact(summary.balanceYocto.toString());
  const freeCapacityBytes = storageCapacityBytesFromYocto(
    summary.withdrawableYocto
  );
  const primaryMeta = [
    `${formatCompactBytes(summary.effectiveBytes)} used`,
    `${formatCompactBytes(freeCapacityBytes)} free`,
  ];
  const reservedLabel =
    summary.lockedYocto > 0n
      ? `${formatNearCompact(summary.lockedYocto.toString())} NEAR reserved`
      : null;

  return (
    <div className="app-storage-readout os-surface-panel">
      <div className="app-storage-readout-head">
        <span className="account-wallet-metric-label">
          {USER_STORAGE_LABEL}
        </span>
        <div className="app-storage-balance-row">
          <span className={`app-storage-balance-value${low ? ' is-low' : ''}`}>
            {balanceLabel}
          </span>
          <span className="account-card-balance-unit">NEAR</span>
        </div>
      </div>
      <p className={`app-storage-meta${low ? ' is-low' : ''}`}>
        {primaryMeta.join(' · ')}
      </p>
      {reservedLabel ? (
        <p className="app-storage-meta app-storage-meta--secondary">
          {reservedLabel}
        </p>
      ) : null}
    </div>
  );
}

function PlatformBufferStatus({
  loading,
  error,
  summary,
}: {
  loading: boolean;
  error: string | null;
  summary: PlatformStorageSummary | null;
}) {
  const description = formatPlatformStorageStatusLine({
    loading,
    error,
    summary,
  });
  const attention =
    Boolean(error) ||
    storageManageIsHighlighted(summary) ||
    (summary != null && summary.availableBytes === 0);

  return (
    <div
      className={`os-surface-row app-storage-status-line${attention ? ' is-attention' : ''}`}
      role="status"
    >
      <span className="os-surface-row-copy">
        <span className="os-surface-row-label">{PLATFORM_STORAGE_LABEL}</span>
        <span className="os-surface-row-description">{description}</span>
      </span>
    </div>
  );
}

function UserStorageBlock({
  loading,
  error,
  summary,
}: {
  loading: boolean;
  error: string | null;
  summary: UserStorageSummary | null;
}) {
  if (loading) {
    return <div className="app-storage-readout is-loading" aria-hidden />;
  }

  if (error) {
    return <p className="app-storage-error">Unavailable right now</p>;
  }

  if (summary) {
    return <UserStorageReadout summary={summary} />;
  }

  return (
    <p className="app-storage-meta">
      No storage yet — add NEAR to get started.
    </p>
  );
}

function StorageBackButton({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" className="app-storage-back" onClick={onClick}>
      <ChevronLeftIcon aria-hidden className="app-storage-back-icon" />
      Storage
    </button>
  );
}

export function AppStorageSheet({
  open,
  accountId,
  pageMoodId = null,
  panelStyle,
  refreshKey = 0,
  onClose,
  onClosed,
  onStorageChanged,
}: AppStorageSheetProps) {
  const { getSigningWallet } = useAppWallet();
  const { trackTransaction } = useAppTransactionFeedback();
  const [closing, setClosing] = useState(false);
  const [localRefreshKey, setLocalRefreshKey] = useState(0);
  const [view, setView] = useState<StorageSheetView>('status');
  const [amountInput, setAmountInput] = useState('0.1');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sheetOpen = open && !closing;
  const combinedRefreshKey = refreshKey + localRefreshKey;

  const platformStorage = usePlatformStorageSummary(
    accountId,
    sheetOpen,
    combinedRefreshKey
  );
  const userStorage = useUserStorageBalance(
    accountId,
    sheetOpen,
    combinedRefreshKey
  );
  const walletNear = useWalletNearBalance(
    accountId,
    sheetOpen,
    combinedRefreshKey
  );
  const sharedPool = useSharedStoragePool(
    accountId,
    sheetOpen && view === 'share',
    combinedRefreshKey
  );

  const summary = userStorage.summary;
  const canWithdraw = (summary?.withdrawableYocto ?? 0n) > 0n;
  const withdrawableYocto = summary?.withdrawableYocto ?? 0n;
  const walletNearYocto = walletNear.balanceYocto;
  const amountHint = formatStorageMinNearLabel(STORAGE_DEPOSIT_MIN_YOCTO);
  const amountMaxYocto =
    view === 'withdraw' ? withdrawableYocto : walletNearYocto;

  const normalizedAmount = useMemo(
    () => finalizeAmountInput(amountInput, STORAGE_NEAR_INPUT_DECIMALS),
    [amountInput]
  );

  const canSubmitAmount = useMemo(() => {
    if (view !== 'deposit' && view !== 'withdraw') return false;
    return isValidStorageAmountInput(normalizedAmount, view, {
      minYocto: STORAGE_DEPOSIT_MIN_YOCTO,
      maxYocto: amountMaxYocto,
    });
  }, [amountMaxYocto, view, normalizedAmount]);

  const depositPreviewCapacityBytes = useMemo(() => {
    if (view !== 'deposit') return null;
    return storageCapacityBytesFromNearInput(normalizedAmount);
  }, [view, normalizedAmount]);

  const refreshAfterTx = useCallback(() => {
    setLocalRefreshKey((current) => current + 1);
    onStorageChanged?.();
  }, [onStorageChanged]);

  const applyAmountInput = useCallback(
    (raw: string) => {
      setAmountInput(
        clampStorageNearAmountInput(raw, {
          maxYocto: amountMaxYocto,
        })
      );
    },
    [amountMaxYocto]
  );

  const requestClose = useCallback(() => {
    setClosing(true);
  }, []);

  const handleSheetClosed = useCallback(() => {
    setClosing(false);
    onClosed?.();
    onClose();
  }, [onClose, onClosed]);

  useEffect(() => {
    if (!open) return;

    setError(null);
    setView('status');
    setAmountInput('0.1');
  }, [open]);

  useEffect(() => {
    if (view === 'withdraw' && !userStorage.loading && !canWithdraw) {
      setView('status');
    }
  }, [canWithdraw, userStorage.loading, view]);

  useEffect(() => {
    setError(null);
  }, [view, amountInput]);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!accountId || (view !== 'deposit' && view !== 'withdraw')) return;

    let amountYocto: bigint;
    try {
      amountYocto = parseStorageAmountYocto(normalizedAmount, view, {
        minYocto: STORAGE_DEPOSIT_MIN_YOCTO,
        maxYocto:
          view === 'withdraw'
            ? withdrawableYocto
            : (walletNearYocto ?? undefined),
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Invalid amount.');
      return;
    }

    setError(null);
    setPending(true);

    try {
      const txHashes =
        view === 'deposit'
          ? await sendStorageDepositTransaction(
              getSigningWallet,
              amountYocto.toString()
            )
          : await sendStorageWithdrawTransaction(
              getSigningWallet,
              amountYocto > 0n ? amountYocto.toString() : undefined
            );

      const confirmed = await trackTransaction({
        txHashes,
        submittedMessage:
          view === 'deposit'
            ? txToastConfirming.addingStorage
            : txToastConfirming.withdrawingStorage,
        successMessage:
          view === 'deposit'
            ? txToastSuccess.storageAdded
            : txToastSuccess.storageWithdrawn,
        failureMessage:
          view === 'deposit'
            ? txToastError.storageDepositFailed
            : txToastError.storageWithdrawFailed,
        onFailure: (message) => setError(message),
      });

      if (confirmed) {
        refreshAfterTx();
      }
    } catch (err) {
      if (isWalletUserCancellation(err)) return;
      setError(
        err instanceof Error ? err.message : 'Transaction did not go through.'
      );
    } finally {
      setPending(false);
    }
  };

  const actionHint =
    view === 'deposit' ? USER_STORAGE_DEPOSIT_HINT : USER_STORAGE_WITHDRAW_HINT;
  const sheetLabel =
    view === 'deposit'
      ? 'Add NEAR'
      : view === 'withdraw'
        ? 'Withdraw NEAR'
        : view === 'share'
          ? 'Share'
          : 'Storage';
  const returnToStatus = () => setView('status');

  return (
    <>
      <OsHugSheet
        open={sheetOpen}
        onClose={requestClose}
        onClosed={handleSheetClosed}
        label={sheetLabel}
        copy={standingIdentityAccountCopy(accountId)}
        closeAriaLabel="Close"
        backdropLabel="Close storage"
        zIndex={SHEET_Z.facts}
        titleId="app-storage-sheet-title"
        headerClassName="account-storage-header"
        panelClassName={`account-storage-panel os-sheet-cap-tall${pageMoodId ? ' account-storage-panel--page-mood' : ''}`}
        {...(panelStyle ? { panelStyle } : {})}
      >
        <div className="app-storage-sheet">
          <section className="app-storage-section">
            {view === 'status' ? (
              <>
                <PlatformBufferStatus
                  loading={platformStorage.loading}
                  error={platformStorage.error}
                  summary={platformStorage.summary}
                />
                <UserStorageBlock
                  loading={userStorage.loading}
                  error={userStorage.error}
                  summary={summary}
                />
                <OsSheetActions
                  layout="stack"
                  tone="frosted-primary"
                  borderless
                >
                  <OsSheetAction
                    type="button"
                    ready
                    onClick={() => {
                      setAmountInput('0.1');
                      setView('deposit');
                    }}
                  >
                    Add NEAR
                  </OsSheetAction>
                </OsSheetActions>
                <div className="app-storage-choice-list">
                  <button
                    type="button"
                    className="os-surface-row os-surface-row--navigate app-storage-choice"
                    disabled={!canWithdraw}
                    onClick={() => {
                      setAmountInput('');
                      setView('withdraw');
                    }}
                  >
                    <span className="os-surface-row-copy">
                      <span className="os-surface-row-label">Withdraw</span>
                      <span className="os-surface-row-description">
                        {canWithdraw
                          ? `${formatNearCompact(withdrawableYocto.toString())} NEAR available`
                          : 'Nothing to withdraw'}
                      </span>
                    </span>
                    <ChevronRightIcon
                      aria-hidden
                      className="os-surface-row-arrow"
                    />
                  </button>
                  <button
                    type="button"
                    className="os-surface-row os-surface-row--navigate app-storage-choice"
                    onClick={() => setView('share')}
                  >
                    <span className="os-surface-row-copy">
                      <span className="os-surface-row-label">Share</span>
                      <span className="os-surface-row-description">
                        {USER_STORAGE_SHARE_HINT}
                      </span>
                    </span>
                    <ChevronRightIcon
                      aria-hidden
                      className="os-surface-row-arrow"
                    />
                  </button>
                </div>
              </>
            ) : null}

            {view === 'share' ? (
              <>
                <StorageBackButton onClick={returnToStatus} />
                <AppStorageSharePanel
                  accountId={accountId}
                  refreshKey={combinedRefreshKey}
                  sharedPool={sharedPool.summary}
                  sharedPoolLoading={sharedPool.loading}
                  sharedPoolError={sharedPool.error}
                  walletNearYocto={walletNearYocto}
                  pending={pending}
                  error={error}
                  setPending={setPending}
                  onError={setError}
                  onPoolChanged={refreshAfterTx}
                  getSigningWallet={getSigningWallet}
                />
              </>
            ) : null}

            {view === 'deposit' || view === 'withdraw' ? (
              <>
                <StorageBackButton onClick={returnToStatus} />
                <UserStorageBlock
                  loading={userStorage.loading}
                  error={userStorage.error}
                  summary={summary}
                />
                <form
                  className="app-storage-form"
                  onSubmit={(event) => void handleSubmit(event)}
                >
                  <AmountField
                    value={amountInput}
                    onValueChange={applyAmountInput}
                    maxDecimals={STORAGE_NEAR_INPUT_DECIMALS}
                    placeholder={amountHint}
                    aria-label="Amount in NEAR"
                    invalid={Boolean(amountInput) && !canSubmitAmount}
                    unit="NEAR"
                  />

                  <AmountFieldMetaRow
                    presets={
                      view === 'deposit'
                        ? STORAGE_DEPOSIT_PRESETS_NEAR
                        : undefined
                    }
                    selectedValue={normalizedAmount}
                    onSelectPreset={
                      view === 'deposit' ? applyAmountInput : undefined
                    }
                    max={
                      view === 'withdraw'
                        ? {
                            onClick: () =>
                              applyAmountInput(
                                yoctoToNear(withdrawableYocto.toString())
                              ),
                            available: canWithdraw,
                          }
                        : undefined
                    }
                    meta={
                      <>
                        {view === 'deposit' &&
                        depositPreviewCapacityBytes != null &&
                        depositPreviewCapacityBytes > 0 ? (
                          <>
                            ≈ {formatCompactBytes(depositPreviewCapacityBytes)}{' '}
                            capacity ·{' '}
                          </>
                        ) : null}
                        {view === 'deposit' && walletNearYocto != null ? (
                          <>
                            Wallet{' '}
                            {formatNearCompact(walletNearYocto.toString())} NEAR
                            ·{' '}
                          </>
                        ) : view === 'withdraw' && canWithdraw ? (
                          <>
                            Withdrawable{' '}
                            {formatNearCompact(withdrawableYocto.toString())}{' '}
                            NEAR ·{' '}
                          </>
                        ) : null}
                        Min {amountHint} NEAR
                      </>
                    }
                  />

                  {error ? (
                    <p className="app-storage-error" role="alert">
                      {error}
                    </p>
                  ) : null}

                  <OsSheetActions
                    layout="stack"
                    tone="frosted-primary"
                    borderless
                  >
                    <OsSheetAction
                      type="submit"
                      ready={canSubmitAmount && !pending && !error}
                      pending={pending}
                      pendingLabel={
                        view === 'deposit' ? 'Adding…' : 'Withdrawing…'
                      }
                      disabled={pending || !canSubmitAmount}
                    >
                      {view === 'deposit' ? 'Add NEAR' : 'Withdraw NEAR'}
                    </OsSheetAction>
                  </OsSheetActions>

                  <p className="app-storage-hint app-storage-hint--compact">
                    {actionHint}
                  </p>
                </form>
              </>
            ) : null}
          </section>
        </div>
      </OsHugSheet>
    </>
  );
}
