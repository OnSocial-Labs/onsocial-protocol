'use client';

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
} from 'react';
import { Divider, GlassSheet, OsSheetActions, OsSheetPrimaryAction, SheetCloseButton } from '@onsocial/ui';
import { usePlatformStorageSummary } from '@/hooks/use-platform-storage-summary';
import { useUserStorageBalance } from '@/hooks/use-user-storage-balance';
import { useWalletNearBalance } from '@/hooks/use-wallet-near-balance';
import { useScrollLock } from '@/hooks/use-scroll-lock';
import { useAppWallet } from '@/contexts/app-wallet-context';
import { finalizeAmountInput } from '@/lib/amount-input';
import { waitForNearTransactionBatchConfirmation, yoctoToNear } from '@/lib/app-near-rpc';
import {
  sendStorageDepositTransaction,
  sendStorageWithdrawTransaction,
} from '@/lib/app-storage-transactions';
import { formatNearCompact } from '@/lib/format-near-balance';
import {
  formatCompactBytes,
  PLATFORM_STORAGE_LABEL,
  PLATFORM_STORAGE_REFILL_HINT,
  type PlatformStorageSummary,
} from '@/lib/platform-storage-display';
import {
  clampStorageNearAmountInput,
  formatStorageMinNearLabel,
  isValidStorageAmountInput,
  parseStorageAmountYocto,
  STORAGE_DEPOSIT_MIN_YOCTO,
  STORAGE_DEPOSIT_PRESETS_NEAR,
  STORAGE_NEAR_INPUT_DECIMALS,
  storageCapacityBytesFromNearInput,
  USER_STORAGE_DEPOSIT_HINT,
  USER_STORAGE_LABEL,
  USER_STORAGE_WITHDRAW_HINT,
  type UserStorageSummary,
} from '@/lib/user-storage-display';
import { isWalletUserCancellation } from '@/lib/wallet-errors';

type StorageActionMode = 'deposit' | 'withdraw';

interface AppStorageSheetProps {
  open: boolean;
  accountId: string;
  refreshKey?: number;
  onClose: () => void;
  onClosed?: () => void;
  onStorageChanged?: () => void;
}

function UserStorageReadout({ summary }: { summary: UserStorageSummary }) {
  const low = summary.effectiveBytes > 0 && summary.headroomPercent <= 25;
  const balanceLabel = formatNearCompact(summary.balanceYocto.toString());
  const metaParts: string[] = [];

  if (summary.depositCapacityBytes > 0) {
    metaParts.push(
      `≈ ${formatCompactBytes(summary.depositCapacityBytes)} capacity`
    );
  }
  metaParts.push(
    `${formatNearCompact(summary.withdrawableYocto.toString())} withdrawable`,
    `${formatCompactBytes(summary.effectiveBytes)} in use`
  );

  return (
    <div className="app-storage-readout">
      <span className="account-card-wallet-label">{USER_STORAGE_LABEL}</span>
      <div className="app-storage-balance-row">
        <span
          className={`app-storage-balance-value${low ? ' is-low' : ''}`}
        >
          {balanceLabel}
        </span>
        <span className="account-card-balance-unit">NEAR</span>
      </div>
      <p className={`app-storage-meta${low ? ' is-low' : ''}`}>
        {metaParts.join(' · ')}
      </p>
    </div>
  );
}

function PlatformStorageSection({
  loading,
  error,
  summary,
}: {
  loading: boolean;
  error: string | null;
  summary: PlatformStorageSummary | null;
}) {
  if (loading) {
    return (
      <div className="app-storage-platform" aria-hidden>
        <span className="account-card-progress-track is-loading" />
      </div>
    );
  }

  if (error || !summary) {
    return (
      <p className="app-storage-meta">{error ?? 'Platform storage unavailable'}</p>
    );
  }

  const low = summary.availablePercent <= 25 && summary.availableBytes > 0;
  const empty = summary.availableBytes === 0;
  const fill =
    summary.availableBytes > 0 ? Math.max(summary.availablePercent, 4) : 0;

  return (
    <div className="app-storage-platform">
      <span className="account-card-wallet-label">{PLATFORM_STORAGE_LABEL}</span>
      <div className="account-card-storage-row account-card-storage-row--sheet">
        <div
          className="account-card-progress-track"
          role="progressbar"
          aria-valuenow={summary.availableBytes}
          aria-valuemin={0}
          aria-valuemax={summary.maxBufferBytes}
        >
          <span
            className={`account-card-progress-fill${empty ? ' is-empty' : low ? ' is-low' : ''}`}
            style={{ width: `${fill}%` }}
          />
        </div>
        <span
          className={`account-card-ratio${empty || summary.phase === 'exhausted' ? ' is-low' : low ? ' is-low' : ''}`}
        >
          {formatCompactBytes(summary.availableBytes)}/
          {formatCompactBytes(summary.maxBufferBytes)}
        </span>
      </div>
      <p className="app-storage-meta">
        {formatCompactBytes(summary.storedBytes)} stored · +
        {formatCompactBytes(summary.dailyRefillBytes)}/day
      </p>
      <p className="app-storage-hint">{PLATFORM_STORAGE_REFILL_HINT}</p>
    </div>
  );
}

export function AppStorageSheet({
  open,
  accountId,
  refreshKey = 0,
  onClose,
  onClosed,
  onStorageChanged,
}: AppStorageSheetProps) {
  const { getSigningWallet } = useAppWallet();
  const [closing, setClosing] = useState(false);
  const [localRefreshKey, setLocalRefreshKey] = useState(0);
  const [mode, setMode] = useState<StorageActionMode>('deposit');
  const [amountInput, setAmountInput] = useState('0.1');
  const [pending, setPending] = useState(false);
  const [saved, setSaved] = useState(false);
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
  const walletNear = useWalletNearBalance(accountId, sheetOpen, combinedRefreshKey);

  useScrollLock(open || closing);

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
    setSaved(false);
    onClosed?.();
    onClose();
  }, [onClose, onClosed]);

  useEffect(() => {
    if (!open) return;

    setError(null);
    setSaved(false);
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
    setSaved(false);
  }, [mode, amountInput]);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!accountId) return;

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
    setSaved(false);
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

      if (txHashes.length > 0) {
        const result = await waitForNearTransactionBatchConfirmation({
          txHashes,
          accountId,
        });

        if (!result.ok) {
          throw new Error(result.errorMessage ?? 'Transaction failed.');
        }
      }

      setSaved(true);
      refreshAfterTx();
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
      <GlassSheet
        open={sheetOpen}
        onClose={requestClose}
        onClosed={handleSheetClosed}
        tone="os"
        initialDetent="full"
        zIndex={57}
        presentation="swap"
        ariaLabelledBy="app-storage-sheet-title"
        backdropLabel="Close storage"
        panelClassName="account-storage-panel"
        bodyClassName="account-storage-body"
        header={
          <>
            <div className="standing-sheet-header account-storage-header">
              <div className="standing-sheet-subject-row">
                <div className="standing-sheet-subject">
                  <h2
                    id="app-storage-sheet-title"
                    className="standing-sheet-subject-name"
                  >
                    Storage
                  </h2>
                  <p className="account-drawer-handle">@{accountId}</p>
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
          <section className="app-storage-section">
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
            </div>

            <form className="app-storage-form" onSubmit={(event) => void handleSubmit(event)}>
              <div className="app-storage-amount-field">
                <input
                  type="text"
                  inputMode="decimal"
                  autoComplete="off"
                  value={amountInput}
                  onChange={(event) => applyAmountInput(event.target.value)}
                  onBlur={() =>
                    applyAmountInput(
                      finalizeAmountInput(
                        amountInput,
                        STORAGE_NEAR_INPUT_DECIMALS
                      )
                    )
                  }
                  placeholder={amountHint}
                  aria-label="Amount in NEAR"
                  aria-invalid={Boolean(amountInput) && !canSubmitAmount}
                  className="app-storage-amount-input"
                />
                <span className="account-card-balance-unit">NEAR</span>
              </div>

              <div className="app-storage-quick-row">
                {mode === 'deposit' ? (
                  <div className="app-storage-presets" role="group" aria-label="Quick amounts">
                    {STORAGE_DEPOSIT_PRESETS_NEAR.map((preset) => (
                      <button
                        key={preset}
                        type="button"
                        className={`app-storage-preset${normalizedAmount === preset ? ' is-selected' : ''}`}
                        onClick={() => applyAmountInput(preset)}
                      >
                        {preset}
                      </button>
                    ))}
                  </div>
                ) : canWithdraw ? (
                  <button
                    type="button"
                    className="app-storage-max"
                    onClick={() =>
                      applyAmountInput(yoctoToNear(withdrawableYocto.toString()))
                    }
                  >
                    Max ({formatNearCompact(withdrawableYocto.toString())} NEAR)
                  </button>
                ) : (
                  <span aria-hidden className="app-storage-max-placeholder">
                    Max
                  </span>
                )}

                <p className="app-storage-amount-meta">
                  {mode === 'deposit' &&
                  depositPreviewCapacityBytes != null &&
                  depositPreviewCapacityBytes > 0 ? (
                    <>≈ {formatCompactBytes(depositPreviewCapacityBytes)} · </>
                  ) : null}
                  {mode === 'deposit' && walletNearYocto != null ? (
                    <>Balance {formatNearCompact(walletNearYocto.toString())} · </>
                  ) : mode === 'withdraw' && canWithdraw ? (
                    <>
                      Withdrawable{' '}
                      {formatNearCompact(withdrawableYocto.toString())} ·{' '}
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
                  type="submit"
                  ready={canSubmitAmount && !saved && !pending && !error}
                  succeeded={saved}
                  succeededLabel={mode === 'deposit' ? 'Added' : 'Withdrawn'}
                  failed={Boolean(error)}
                  failedLabel="Try again"
                  pending={pending}
                  pendingLabel={mode === 'deposit' ? 'Adding…' : 'Withdrawing…'}
                  disabled={saved || pending || !canSubmitAmount}
                >
                  {mode === 'deposit' ? 'Add NEAR' : 'Withdraw NEAR'}
                </OsSheetPrimaryAction>
              </OsSheetActions>

              <p className="app-storage-hint">{actionHint}</p>
            </form>
          </section>

          <Divider variant="section" />

          <section className="app-storage-section">
            <PlatformStorageSection
              loading={platformStorage.loading}
              error={platformStorage.error}
              summary={platformStorage.summary}
            />
          </section>
        </div>
      </GlassSheet>
    </>
  );
}
