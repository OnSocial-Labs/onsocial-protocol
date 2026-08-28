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
  Divider,
  OsHugSheet,
  OsSheetAction,
  OsSheetActions,
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
  formatPlatformBufferRatioLabel,
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
  USER_STORAGE_DEPOSIT_HINT,
  USER_STORAGE_LABEL,
  USER_STORAGE_WITHDRAW_HINT,
  type UserStorageSummary,
} from '@/lib/user-storage-display';
import { isWalletUserCancellation } from '@/lib/wallet-errors';
import {
  txToastConfirming,
  txToastError,
  txToastSuccess,
} from '@/lib/transaction-toast-copy';

type StorageActionMode = 'deposit' | 'withdraw' | 'share';

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
  const secondaryMeta = [
    `${formatNearCompact(summary.withdrawableYocto.toString())} NEAR withdrawable`,
  ];

  if (summary.lockedYocto > 0n) {
    secondaryMeta.push(
      `${formatNearCompact(summary.lockedYocto.toString())} NEAR reserved`
    );
  }

  return (
    <div className="app-storage-readout">
      <div className="app-storage-readout-head">
        <span className="account-card-wallet-label">{USER_STORAGE_LABEL}</span>
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
      <p className="app-storage-meta app-storage-meta--secondary">
        {secondaryMeta.join(' · ')}
      </p>
    </div>
  );
}

function StorageContextStrip({
  userSummary,
  platformSummary,
}: {
  userSummary: UserStorageSummary | null;
  platformSummary: PlatformStorageSummary | null;
}) {
  const rows: Array<{ label: string; value: string }> = [];

  if (userSummary) {
    const freeCapacityBytes = storageCapacityBytesFromYocto(
      userSummary.withdrawableYocto
    );
    rows.push({
      label: USER_STORAGE_LABEL,
      value: `${formatCompactBytes(freeCapacityBytes)} free · ${formatNearCompact(userSummary.withdrawableYocto.toString())} NEAR withdrawable`,
    });
  }

  if (platformSummary) {
    const platformRatio = formatPlatformBufferRatioLabel(
      platformSummary.availableBytes,
      platformSummary.maxBufferBytes
    );
    rows.push({
      label: PLATFORM_STORAGE_LABEL,
      value:
        platformSummary.phase === 'inactive'
          ? `+${formatCompactBytes(platformSummary.dailyRefillBytes)}/day · ${formatCompactBytes(platformSummary.maxBufferBytes)} cap`
          : `${platformRatio} · ${formatCompactBytes(platformSummary.storedBytes)} covered`,
    });
  }

  if (rows.length === 0) return null;

  return (
    <div className="app-storage-context-strip" aria-label="Storage context">
      {rows.map((row) => (
        <p key={row.label} className="app-storage-context-row">
          <span>{row.label}</span>
          <strong>{row.value}</strong>
        </p>
      ))}
    </div>
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
  const [mode, setMode] = useState<StorageActionMode>('deposit');
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
    sheetOpen && mode === 'share',
    combinedRefreshKey
  );

  const summary = userStorage.summary;
  const canWithdraw = (summary?.withdrawableYocto ?? 0n) > 0n;
  const withdrawableYocto = summary?.withdrawableYocto ?? 0n;
  const walletNearYocto = walletNear.balanceYocto;
  const amountHint = formatStorageMinNearLabel(STORAGE_DEPOSIT_MIN_YOCTO);
  const amountMaxYocto =
    mode === 'withdraw' ? withdrawableYocto : walletNearYocto;

  const normalizedAmount = useMemo(
    () => finalizeAmountInput(amountInput, STORAGE_NEAR_INPUT_DECIMALS),
    [amountInput]
  );

  const canSubmitAmount = useMemo(() => {
    if (mode === 'share') return false;
    return isValidStorageAmountInput(normalizedAmount, mode, {
      minYocto: STORAGE_DEPOSIT_MIN_YOCTO,
      maxYocto: amountMaxYocto,
    });
  }, [amountMaxYocto, mode, normalizedAmount]);

  const depositPreviewCapacityBytes = useMemo(() => {
    if (mode !== 'deposit') return null;
    return storageCapacityBytesFromNearInput(normalizedAmount);
  }, [mode, normalizedAmount]);

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
    setMode('deposit');
    setAmountInput('0.1');
  }, [open]);

  useEffect(() => {
    if (mode === 'withdraw' && !canWithdraw) {
      setMode('deposit');
    }
  }, [canWithdraw, mode]);

  useEffect(() => {
    setError(null);
  }, [mode, amountInput]);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!accountId || mode === 'share') return;

    let amountYocto: bigint;
    try {
      amountYocto = parseStorageAmountYocto(normalizedAmount, mode, {
        minYocto: STORAGE_DEPOSIT_MIN_YOCTO,
        maxYocto:
          mode === 'withdraw'
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
        mode === 'deposit'
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
          mode === 'deposit'
            ? txToastConfirming.addingStorage
            : txToastConfirming.withdrawingStorage,
        successMessage:
          mode === 'deposit'
            ? txToastSuccess.storageAdded
            : txToastSuccess.storageWithdrawn,
        failureMessage:
          mode === 'deposit'
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
    mode === 'deposit' ? USER_STORAGE_DEPOSIT_HINT : USER_STORAGE_WITHDRAW_HINT;

  return (
    <>
      <OsHugSheet
        open={sheetOpen}
        onClose={requestClose}
        onClosed={handleSheetClosed}
        label="Storage"
        copy={`@${accountId}`}
        closeAriaLabel="Close"
        backdropLabel="Close storage"
        zIndex={SHEET_Z.facts}
        titleId="app-storage-sheet-title"
        headerClassName="account-storage-header"
        panelClassName={`account-storage-panel os-sheet-cap-tall${pageMoodId ? ' account-storage-panel--page-mood' : ''}`}
        bodyClassName="account-storage-body"
        {...(panelStyle ? { panelStyle } : {})}
      >
        <div className="app-storage-sheet">
          <section className="app-storage-section">
            <div
              className="app-storage-mode-toggle"
              role="group"
              aria-label="Storage action"
            >
              <button
                type="button"
                className={`app-storage-mode${mode === 'deposit' ? ' is-active' : ''}`}
                onClick={() => setMode('deposit')}
              >
                Add
              </button>
              <button
                type="button"
                className={`app-storage-mode${mode === 'withdraw' ? ' is-active' : ''}`}
                disabled={!canWithdraw}
                onClick={() => setMode('withdraw')}
              >
                Withdraw
              </button>
              <button
                type="button"
                className={`app-storage-mode${mode === 'share' ? ' is-active' : ''}`}
                onClick={() => setMode('share')}
              >
                Share
              </button>
            </div>

            <Divider variant="section" className="app-storage-mode-divider" />

            {mode === 'share' ? (
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
            ) : (
              <>
                {userStorage.loading ? (
                  <div className="app-storage-readout is-loading" aria-hidden />
                ) : userStorage.error ? (
                  <p className="app-storage-error">{userStorage.error}</p>
                ) : summary ? (
                  <UserStorageReadout summary={summary} />
                ) : (
                  <p className="app-storage-meta">
                    No storage yet — add NEAR to get started.
                  </p>
                )}

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
                      mode === 'deposit'
                        ? STORAGE_DEPOSIT_PRESETS_NEAR
                        : undefined
                    }
                    selectedValue={normalizedAmount}
                    onSelectPreset={
                      mode === 'deposit' ? applyAmountInput : undefined
                    }
                    max={
                      mode === 'withdraw'
                        ? {
                            onClick: () =>
                              applyAmountInput(
                                yoctoToNear(withdrawableYocto.toString())
                              ),
                            available: canWithdraw,
                            variant: 'action',
                          }
                        : undefined
                    }
                    meta={
                      <>
                        {mode === 'deposit' &&
                        depositPreviewCapacityBytes != null &&
                        depositPreviewCapacityBytes > 0 ? (
                          <>
                            ≈ {formatCompactBytes(depositPreviewCapacityBytes)}{' '}
                            capacity ·{' '}
                          </>
                        ) : null}
                        {mode === 'deposit' && walletNearYocto != null ? (
                          <>
                            Wallet{' '}
                            {formatNearCompact(walletNearYocto.toString())} NEAR
                            ·{' '}
                          </>
                        ) : mode === 'withdraw' && canWithdraw ? (
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
                        mode === 'deposit' ? 'Adding…' : 'Withdrawing…'
                      }
                      disabled={pending || !canSubmitAmount}
                    >
                      {mode === 'deposit' ? 'Add NEAR' : 'Withdraw NEAR'}
                    </OsSheetAction>
                  </OsSheetActions>

                  <p className="app-storage-hint">{actionHint}</p>
                </form>
              </>
            )}

            <StorageContextStrip
              userSummary={mode === 'share' ? (summary ?? null) : null}
              platformSummary={platformStorage.summary}
            />
          </section>
        </div>
      </OsHugSheet>
    </>
  );
}
