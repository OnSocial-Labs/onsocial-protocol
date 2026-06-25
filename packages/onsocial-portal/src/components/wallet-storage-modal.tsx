'use client';

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { TransactionFeedbackToast } from '@/components/ui/transaction-feedback-toast';
import {
  compactModalBodyClass,
  compactModalBodyDenseClass,
  compactModalHeaderDenseClass,
  compactModalSectionLabelClass,
  compactModalSectionYClass,
  compactModalShellClass,
  portalElevatedShadowClass,
  walletMenuMetricCaptionSlotClass,
  walletMenuMetricRowClass,
} from '@/components/ui/floating-panel';
import { ModalCloseButton } from '@/components/ui/modal-close-button';
import { ModalHeader } from '@/components/ui/modal-header';
import { TokenIcon } from '@/components/ui/token-icon';
import { AllowanceProgressBar } from '@/components/platform-storage-allowance-summary';
import { WalletStorageSharePanel } from '@/components/wallet-storage-share-panel';
import { SocialSpendAmountPill } from '@/components/social-spend-pill';
import { useBodyScrollLock } from '@/hooks/use-body-scroll-lock';
import { useNearTransactionFeedback } from '@/hooks/use-near-transaction-feedback';
import { usePlatformStorageSummary } from '@/hooks/use-platform-storage-summary';
import { useSharedStoragePool } from '@/hooks/use-shared-storage-pool';
import { useUserStorageBalance } from '@/hooks/use-user-storage-balance';
import { useWalletNearBalance } from '@/hooks/use-wallet-near-balance';
import { useWallet } from '@/contexts/wallet-context';
import { finalizeAmountInput } from '@/lib/amount-input';
import { formatNearCompact } from '@/lib/leaderboard';
import { fadeMotion, scaleFadeMotion } from '@/lib/motion';
import { yoctoToNear } from '@/lib/near-rpc';
import {
  sendStorageDepositTransaction,
  sendStorageWithdrawTransaction,
} from '@/lib/portal-storage-transactions';
import {
  formatCompactBytes,
  PLATFORM_STORAGE_LABEL,
  type PlatformStorageSummary,
} from '@/lib/platform-storage-display';
import {
  txToastError,
  txToastPending,
  txToastSuccess,
} from '@/lib/transaction-toast-copy';
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
  USER_STORAGE_SHARE_HINT,
  USER_STORAGE_WITHDRAW_HINT,
  type UserStorageSummary,
} from '@/lib/user-storage-display';
import {
  isWalletUserCancellation,
  reportWalletActionFailure,
} from '@/lib/wallet-errors';
import { cn } from '@/lib/utils';

type StorageActionMode = 'deposit' | 'withdraw' | 'share';

interface WalletStorageModalProps {
  open: boolean;
  accountId: string | null;
  onOpenChange: (open: boolean) => void;
  refreshKey?: number;
  onStorageChanged?: () => void;
}

const sectionEyebrowClass = 'portal-eyebrow-wide text-muted-foreground/45';

const NEAR_TOKEN_ICON = '/near.svg';

/** Preset pill row + Max link share one height so Add/Withdraw do not resize the modal. */
const storageModalQuickAmountRowClass =
  'flex min-h-7 flex-wrap items-center justify-between gap-x-3 gap-y-1.5';

const storageModalQuickAmountSlotClass =
  'flex min-h-7 min-w-0 flex-1 items-center';

/** Two-line caption slot — deposit vs withdraw hints differ in length. */
const storageModalHintSlotClass =
  'min-h-[2.5rem] portal-type-caption leading-snug text-muted-foreground/45';

const AMOUNT_INPUT_CLASS =
  'min-w-0 flex-1 bg-transparent font-mono text-lg font-semibold tracking-[-0.02em] text-foreground outline-none placeholder:text-muted-foreground/50 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none';

/** One-line personal storage context on Share when user also has a funded pool. */
function UserStorageShareStrip({ summary }: { summary: UserStorageSummary }) {
  const low = summary.effectiveBytes > 0 && summary.headroomPercent <= 25;
  const balanceLabel = formatNearCompact(summary.balanceYocto.toString());
  const detailParts: string[] = [];
  if (summary.depositCapacityBytes > 0) {
    detailParts.push(
      `≈ ${formatCompactBytes(summary.depositCapacityBytes)} capacity`
    );
  }
  detailParts.push(`${formatCompactBytes(summary.effectiveBytes)} in use`);

  return (
    <p
      className={cn(
        walletMenuMetricCaptionSlotClass,
        'mb-2 flex flex-wrap items-baseline gap-x-1 gap-y-0.5',
        low && 'text-[var(--portal-amber)]/85'
      )}
      aria-label={`${USER_STORAGE_LABEL}: ${balanceLabel} NEAR deposited`}
    >
      <span className={cn(sectionEyebrowClass, 'mb-0 shrink-0')}>
        {USER_STORAGE_LABEL}
      </span>
      <span className="text-muted-foreground/35" aria-hidden>
        ·
      </span>
      <span className="inline whitespace-nowrap font-mono portal-type-micro tabular-nums">
        <span
          className={cn(
            'font-semibold',
            low ? 'text-[var(--portal-amber)]' : 'text-portal-neutral'
          )}
        >
          {balanceLabel}
        </span>
        <span className="text-muted-foreground/45"> NEAR</span>
      </span>
      <span className="text-muted-foreground/35" aria-hidden>
        ·
      </span>
      <span>{detailParts.join(' · ')}</span>
    </p>
  );
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
  if (summary.lockedYocto > 0n) {
    metaParts.push(
      `${formatNearCompact(summary.lockedYocto.toString())} locked`
    );
  }

  return (
    <div className="space-y-0.5">
      <p className={cn(sectionEyebrowClass, compactModalSectionLabelClass)}>
        {USER_STORAGE_LABEL}
      </p>
      <div
        className="flex items-baseline gap-1.5"
        aria-label={`${balanceLabel} NEAR deposited for storage`}
      >
        <span
          className={cn(
            'font-mono font-semibold leading-none tracking-tight tabular-nums portal-type-lead',
            low ? 'text-[var(--portal-amber)]' : 'text-portal-neutral'
          )}
        >
          {balanceLabel}
        </span>
        <span className="font-mono portal-type-caption font-medium tabular-nums text-muted-foreground/55">
          NEAR
        </span>
      </div>
      <p
        className={cn(
          walletMenuMetricCaptionSlotClass,
          low && 'text-[var(--portal-amber)]/85'
        )}
      >
        {metaParts.join(' · ')}
      </p>
    </div>
  );
}

function PlatformStorageMeta({ summary }: { summary: PlatformStorageSummary }) {
  const parts = [
    `${formatCompactBytes(summary.storedBytes)} stored`,
    `+${formatCompactBytes(summary.dailyRefillBytes)}/day`,
    `${formatCompactBytes(summary.maxBufferBytes)} cap`,
  ];

  return (
    <p className={walletMenuMetricCaptionSlotClass}>{parts.join(' · ')}</p>
  );
}

function StorageModeToggle({
  mode,
  onChange,
  canWithdraw,
}: {
  mode: StorageActionMode;
  onChange: (mode: StorageActionMode) => void;
  canWithdraw: boolean;
}) {
  const options: {
    id: StorageActionMode;
    label: string;
    disabled?: boolean;
  }[] = [
    { id: 'deposit', label: 'Add' },
    { id: 'withdraw', label: 'Withdraw', disabled: !canWithdraw },
    { id: 'share', label: 'Share' },
  ];

  return (
    <div
      className="flex gap-0.5 rounded-full border border-border/40 bg-background/45 p-0.5"
      role="group"
      aria-label="Storage action"
    >
      {options.map((option) => (
        <button
          key={option.id}
          type="button"
          onClick={() => onChange(option.id)}
          disabled={option.disabled}
          className={cn(
            'flex-1 rounded-full px-2 py-1 portal-type-label font-medium transition-colors',
            mode === option.id
              ? 'bg-[var(--portal-neutral-bg)] text-foreground shadow-sm'
              : 'text-muted-foreground/60 enabled:hover:text-foreground',
            option.disabled &&
              'pointer-events-none cursor-not-allowed opacity-45'
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

export function WalletStorageModal({
  open,
  accountId,
  onOpenChange,
  refreshKey = 0,
  onStorageChanged,
}: WalletStorageModalProps) {
  const reduceMotion = useReducedMotion();
  const titleId = useId();
  const scrollRef = useRef<HTMLDivElement>(null);
  const { getSigningWallet } = useWallet();
  const { txResult, clearTxResult, setTxResult, trackTransaction } =
    useNearTransactionFeedback(accountId);
  const platformStorage = usePlatformStorageSummary(accountId, open);
  const userStorage = useUserStorageBalance(accountId, open, refreshKey);
  const walletNear = useWalletNearBalance(accountId, open, refreshKey);
  const [mode, setMode] = useState<StorageActionMode>('deposit');
  const [localRefreshKey, setLocalRefreshKey] = useState(0);
  const sharedPool = useSharedStoragePool(
    accountId,
    open && mode === 'share',
    refreshKey + localRefreshKey
  );
  const [amountInput, setAmountInput] = useState('0.1');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useBodyScrollLock(open, scrollRef);

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

  useEffect(() => {
    if (!open) return;

    setError(null);
    setMode('deposit');
    setAmountInput('0.1');

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onOpenChange(false);
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onOpenChange, open]);

  useEffect(() => {
    if (mode === 'withdraw' && !canWithdraw) {
      setMode('deposit');
    }
  }, [canWithdraw, mode]);

  useEffect(() => {
    setError(null);
  }, [mode]);

  const handleSubmit = async () => {
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
    clearTxResult();
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
            ? txToastPending.addingStorage
            : txToastPending.withdrawingStorage,
        successMessage:
          mode === 'deposit'
            ? txToastSuccess.storageAdded
            : txToastSuccess.storageWithdrawn,
        failureMessage:
          mode === 'deposit'
            ? txToastError.storageDepositFailed
            : txToastError.storageWithdrawFailed,
      });

      if (confirmed) {
        refreshAfterTx();
      }
    } catch (err) {
      if (isWalletUserCancellation(err)) return;
      reportWalletActionFailure(err, (message) => {
        setError(message);
        setTxResult({ type: 'error', msg: message });
      });
    } finally {
      setPending(false);
    }
  };

  if (typeof document === 'undefined') return null;

  const loading = userStorage.loading || platformStorage.loading;
  const actionHint =
    mode === 'deposit'
      ? USER_STORAGE_DEPOSIT_HINT
      : mode === 'withdraw'
        ? USER_STORAGE_WITHDRAW_HINT
        : null;
  const submitDisabled = pending || !accountId || !canSubmitAmount;
  const showUserStorageShareStrip =
    mode === 'share' &&
    summary != null &&
    summary.balanceYocto > 0n &&
    (sharedPool.summary?.totalCapacityBytes ?? 0) > 0;

  return createPortal(
    <AnimatePresence initial={false}>
      {open ? (
        <motion.div
          {...fadeMotion(reduceMotion ? 0 : 0.18)}
          data-lenis-prevent
          className="fixed inset-0 z-[2147483645] flex items-center justify-center px-3 py-4 sm:px-4 sm:py-6"
        >
          <button
            type="button"
            className="absolute inset-0 bg-background/72 backdrop-blur-md"
            aria-label="Close storage"
            onClick={() => onOpenChange(false)}
          />

          <motion.div
            {...scaleFadeMotion(!!reduceMotion, {
              y: 14,
              scale: 0.98,
              duration: 0.22,
              exitY: 8,
              exitScale: 0.99,
            })}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            className={cn(compactModalShellClass, portalElevatedShadowClass)}
          >
            <ModalHeader
              titleId={titleId}
              title="Storage"
              description={
                accountId
                  ? `@${accountId}`
                  : 'Connect a wallet to manage storage'
              }
              descriptionVariant="meta"
              bordered
              className={compactModalHeaderDenseClass}
              actions={
                <ModalCloseButton
                  ariaLabel="Close storage"
                  onClick={() => onOpenChange(false)}
                />
              }
            />

            <div
              ref={scrollRef}
              className={cn(
                compactModalBodyClass,
                compactModalBodyDenseClass,
                mode === 'share' && 'pb-5',
                'space-y-0'
              )}
            >
              <section
                className={cn(
                  mode !== 'share' && 'border-b border-fade-section',
                  mode === 'share' && 'pb-4',
                  compactModalSectionYClass
                )}
              >
                {loading && mode !== 'share' ? (
                  <div className="space-y-1" aria-hidden>
                    <div className="h-3 w-16 animate-pulse rounded bg-muted/35" />
                    <div className="h-5 w-20 animate-pulse rounded bg-muted/30" />
                    <div className="h-3 w-40 animate-pulse rounded bg-muted/25" />
                  </div>
                ) : userStorage.error && mode !== 'share' ? (
                  <p className="portal-type-body-sm text-[var(--portal-amber)]">
                    {userStorage.error}
                  </p>
                ) : summary && mode !== 'share' ? (
                  <UserStorageReadout summary={summary} />
                ) : mode !== 'share' ? (
                  <p className="portal-type-body-sm text-muted-foreground/60">
                    No storage yet — add NEAR to get started.
                  </p>
                ) : null}

                {mode === 'share' && accountId ? (
                  <>
                    {showUserStorageShareStrip && summary ? (
                      <UserStorageShareStrip summary={summary} />
                    ) : null}
                    <WalletStorageSharePanel
                      accountId={accountId}
                      refreshKey={refreshKey + localRefreshKey}
                      sharedPool={sharedPool.summary}
                      sharedPoolLoading={sharedPool.loading}
                      walletNearYocto={walletNearYocto}
                      pending={pending}
                      setPending={setPending}
                      error={error}
                      onError={setError}
                      onPoolChanged={refreshAfterTx}
                      getSigningWallet={getSigningWallet}
                      trackTransaction={trackTransaction}
                      clearTxResult={clearTxResult}
                      setTxResult={setTxResult}
                      toggleAfterReadout={
                        <StorageModeToggle
                          mode={mode}
                          onChange={setMode}
                          canWithdraw={canWithdraw}
                        />
                      }
                    />
                  </>
                ) : (
                  <div className="mt-3 space-y-3">
                    <StorageModeToggle
                      mode={mode}
                      onChange={setMode}
                      canWithdraw={canWithdraw}
                    />
                    <div className="space-y-2">
                      <div className="portal-field-focus flex items-center gap-2.5 rounded-2xl border border-border/40 bg-background/45 px-3 py-2.5">
                        <input
                          type="text"
                          inputMode="decimal"
                          autoComplete="off"
                          value={amountInput}
                          onChange={(event) =>
                            applyAmountInput(event.target.value)
                          }
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
                          aria-invalid={
                            Boolean(amountInput) && !canSubmitAmount
                          }
                          className={AMOUNT_INPUT_CLASS}
                        />
                        <div
                          className="h-5 w-px shrink-0 divider-v-section"
                          aria-hidden="true"
                        />
                        <span className="inline-flex shrink-0 items-center gap-1.5 text-sm text-muted-foreground">
                          <TokenIcon
                            src={NEAR_TOKEN_ICON}
                            label="NEAR"
                            size="md"
                          />
                          <span className="portal-type-caption font-medium text-muted-foreground/55">
                            NEAR
                          </span>
                        </span>
                      </div>

                      <div className={storageModalQuickAmountRowClass}>
                        <div className={storageModalQuickAmountSlotClass}>
                          {mode === 'deposit' ? (
                            <div
                              className="flex flex-wrap gap-1.5"
                              role="group"
                              aria-label="Quick amounts"
                            >
                              {STORAGE_DEPOSIT_PRESETS_NEAR.map((preset) => {
                                const selected = normalizedAmount === preset;
                                return (
                                  <SocialSpendAmountPill
                                    key={preset}
                                    selected={selected}
                                    onClick={() => applyAmountInput(preset)}
                                  >
                                    {preset}
                                  </SocialSpendAmountPill>
                                );
                              })}
                            </div>
                          ) : canWithdraw ? (
                            <button
                              type="button"
                              onClick={() =>
                                applyAmountInput(
                                  yoctoToNear(withdrawableYocto.toString())
                                )
                              }
                              className="portal-type-label text-[var(--portal-blue)] transition-colors hover:text-[var(--portal-blue-hover)]"
                            >
                              Max (
                              {formatNearCompact(withdrawableYocto.toString())}{' '}
                              NEAR)
                            </button>
                          ) : (
                            <span aria-hidden="true" className="invisible">
                              Max
                            </span>
                          )}
                        </div>

                        <p className="portal-type-micro ml-auto min-h-4 shrink-0 text-right tabular-nums text-muted-foreground/50">
                          {mode === 'deposit' &&
                          depositPreviewCapacityBytes != null &&
                          depositPreviewCapacityBytes > 0 ? (
                            <>
                              ≈{' '}
                              <span className="font-mono font-semibold text-portal-neutral">
                                {formatCompactBytes(
                                  depositPreviewCapacityBytes
                                )}
                              </span>
                              <span
                                className="text-muted-foreground/35"
                                aria-hidden="true"
                              >
                                {' '}
                                ·{' '}
                              </span>
                            </>
                          ) : null}
                          {mode === 'deposit' && walletNearYocto != null ? (
                            <>
                              Balance{' '}
                              <span className="text-muted-foreground/70">
                                {formatNearCompact(walletNearYocto.toString())}
                              </span>
                              <span
                                className="text-muted-foreground/35"
                                aria-hidden="true"
                              >
                                {' '}
                                ·{' '}
                              </span>
                            </>
                          ) : mode === 'withdraw' && canWithdraw ? (
                            <>
                              Withdrawable{' '}
                              <span className="text-muted-foreground/70">
                                {formatNearCompact(
                                  withdrawableYocto.toString()
                                )}
                              </span>
                              <span
                                className="text-muted-foreground/35"
                                aria-hidden="true"
                              >
                                {' '}
                                ·{' '}
                              </span>
                            </>
                          ) : null}
                          Min {amountHint}
                        </p>
                      </div>
                    </div>

                    {error ? (
                      <p className="rounded-xl border border-[var(--portal-red-border)] bg-[var(--portal-red-bg)] px-2.5 py-2 portal-type-caption leading-relaxed text-[var(--portal-red)]">
                        {error}
                      </p>
                    ) : null}

                    <Button
                      type="button"
                      variant="accent"
                      size="sm"
                      className="h-10 w-full"
                      disabled={submitDisabled}
                      loading={pending}
                      onClick={() => {
                        void handleSubmit();
                      }}
                    >
                      {mode === 'deposit' ? 'Add NEAR' : 'Withdraw NEAR'}
                    </Button>

                    {actionHint ? (
                      <p className={storageModalHintSlotClass}>{actionHint}</p>
                    ) : null}
                  </div>
                )}
              </section>

              {mode !== 'share' ? (
                <section className={compactModalSectionYClass}>
                  <h3
                    className={cn(
                      sectionEyebrowClass,
                      compactModalSectionLabelClass
                    )}
                  >
                    {PLATFORM_STORAGE_LABEL}
                  </h3>

                  {platformStorage.loading ? (
                    <div className="space-y-1" aria-hidden>
                      <div className={walletMenuMetricRowClass}>
                        <div className="h-3 w-14 animate-pulse rounded bg-muted/35" />
                        <div className="h-1 flex-1 animate-pulse rounded-full bg-muted/30" />
                        <div className="h-3 w-20 animate-pulse rounded bg-muted/35" />
                      </div>
                    </div>
                  ) : platformStorage.error ? (
                    <p className="portal-type-body-sm text-muted-foreground/55">
                      {platformStorage.error}
                    </p>
                  ) : platformStorage.summary ? (
                    <div className="space-y-0.5">
                      <AllowanceProgressBar
                        summary={platformStorage.summary}
                        compact
                      />
                      <PlatformStorageMeta summary={platformStorage.summary} />
                    </div>
                  ) : (
                    <p className="portal-type-body-sm text-muted-foreground/55">
                      Unavailable
                    </p>
                  )}
                </section>
              ) : null}
            </div>

            <TransactionFeedbackToast
              result={txResult}
              onClose={clearTxResult}
            />
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>,
    document.body
  );
}
