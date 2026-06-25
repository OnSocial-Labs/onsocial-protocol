'use client';

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { ChevronDown, Plus, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { NearAccountField } from '@/components/ui/near-account-field';
import { ProtocolMotionArrow } from '@onsocial/ui';
import { SocialSpendAmountPill } from '@/components/social-spend-pill';
import { TokenIcon } from '@/components/ui/token-icon';
import {
  compactModalSectionLabelClass,
  walletMenuMetricCaptionSlotClass,
  walletMenuProgressTrackSlotClass,
} from '@/components/ui/floating-panel';
import { useStorageSharesGranted } from '@/hooks/use-storage-shares-granted';
import { useStorageShareRecipientsValidation } from '@/hooks/use-storage-share-recipients';
import type { ShareRecipientRowStatus } from '@/hooks/use-storage-share-recipients';
import type { SharedStoragePoolSummary } from '@/hooks/use-shared-storage-pool';
import { finalizeAmountInput } from '@/lib/amount-input';
import { formatNearCompact } from '@/lib/leaderboard';
import type { SigningWallet } from '@/lib/portal-social-session';
import {
  sendStorageShareBatchTransaction,
  sendStorageSharedPoolDepositTransaction,
} from '@/lib/portal-storage-transactions';
import { formatCompactBytes } from '@/lib/platform-storage-display';
import {
  txToastError,
  txToastPending,
  txToastSuccess,
} from '@/lib/transaction-toast-copy';
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
  STORAGE_DEPOSIT_MIN_YOCTO,
  STORAGE_DEPOSIT_PRESETS_NEAR,
  STORAGE_NEAR_INPUT_DECIMALS,
  STORAGE_SHARE_PERCENT_PRESETS,
  USER_STORAGE_DEPOSIT_HINT,
  USER_STORAGE_SHARE_HINT,
  type ActiveStorageShareGrant,
} from '@/lib/user-storage-display';
import {
  isWalletUserCancellation,
  reportWalletActionFailure,
} from '@/lib/wallet-errors';
import { portalCollapseMotion } from '@/features/governance/governance-motion';
import { cn } from '@/lib/utils';

const NEAR_TOKEN_ICON = '/near.svg';
const SHARE_POOL_LABEL = 'Share pool';

const sectionEyebrowClass = 'portal-eyebrow-wide text-muted-foreground/45';

const storageModalQuickAmountRowClass =
  'flex min-h-7 flex-wrap items-center justify-between gap-x-3 gap-y-1.5';

const storageModalQuickAmountSlotClass =
  'flex min-h-7 min-w-0 flex-1 items-center';

/** Matches Add/Withdraw hint slot so fund/share CTAs do not resize the modal. */
const storageModalHintSlotClass =
  'min-h-[2.5rem] portal-type-caption leading-snug text-muted-foreground/45';

const AMOUNT_INPUT_CLASS =
  'min-w-0 flex-1 bg-transparent font-mono text-lg font-semibold tracking-[-0.02em] text-foreground outline-none placeholder:text-muted-foreground/50 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none';

type ShareRowIssue = Exclude<
  ShareRecipientRowStatus,
  'empty' | 'ready' | 'invalid' | 'checking'
>;

function shareRowIssueMessage(issue: ShareRowIssue): string {
  switch (issue) {
    case 'self':
      return 'You cannot share with yourself.';
    case 'duplicate':
      return 'This account is already in the list.';
    case 'already_sponsored':
      return 'This account already has shared storage.';
  }
}

function CompactByteAmount({
  bytes,
  muted = false,
  size = 'micro',
}: {
  bytes: number;
  muted?: boolean;
  size?: 'micro' | 'lead';
}) {
  const formatted = formatCompactBytes(bytes);
  const parts = formatted.match(/^([\d.]+)\s+(.+)$/);

  if (!parts) {
    return (
      <span
        className={cn(
          'font-mono tabular-nums',
          size === 'lead'
            ? 'portal-type-lead font-semibold'
            : 'portal-type-micro'
        )}
      >
        {formatted}
      </span>
    );
  }

  return (
    <span
      className={cn(
        'inline whitespace-nowrap font-mono tabular-nums',
        size === 'lead' ? 'portal-type-lead' : 'portal-type-micro'
      )}
    >
      <span
        className={cn(
          size === 'lead'
            ? 'font-semibold leading-none tracking-tight'
            : 'font-semibold',
          muted ? 'text-muted-foreground/65' : 'text-portal-neutral'
        )}
      >
        {parts[1]}
      </span>
      <span
        className={cn(
          size === 'lead' ? 'portal-type-label' : 'portal-type-micro',
          'text-muted-foreground/45'
        )}
      >
        {' '}
        {parts[2]}
      </span>
    </span>
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
    <div className="space-y-1">
      <div
        className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--portal-slate-bg)]"
        role="img"
        aria-label={
          showBytes
            ? `${sharePercent === 100 ? 'Max' : `${sharePercent}%`} split · ${formatCompactBytes(totalShareBytes)} across ${readyCount} recipients`
            : `${sharePercent === 100 ? 'Max' : `${sharePercent}%`} pool split${readyCount > 0 ? ` · ${readyCount} recipients` : ''}`
        }
      >
        <div
          className="flex h-full transition-[width] duration-300 ease-out"
          style={{ width: `${sharePercent}%` }}
        >
          {readyCount > 0 ? (
            Array.from({ length: readyCount }, (_, index) => (
              <div
                key={index}
                className={cn(
                  'h-full min-w-0 flex-1 border-r border-background/25 last:border-r-0',
                  belowMin ? 'bg-[var(--portal-amber)]/70' : 'bg-portal-neutral'
                )}
              />
            ))
          ) : (
            <div
              className={cn(
                'h-full w-full',
                needsFunding ? 'bg-muted-foreground/20' : 'bg-portal-neutral/50'
              )}
            />
          )}
        </div>
      </div>

      {showBytes || belowMin ? (
        <p className="flex w-full items-center gap-0.5 overflow-x-auto whitespace-nowrap font-mono portal-type-micro tabular-nums leading-none text-muted-foreground/55">
          {showBytes ? (
            <>
              <span className="text-muted-foreground/45">×{readyCount}</span>
              <span className="text-muted-foreground/30"> · </span>
              <CompactByteAmount bytes={bytesPerRecipient} />
              <ProtocolMotionArrow
                static
                className="h-2 w-2 shrink-0 text-muted-foreground/35"
              />
              <CompactByteAmount bytes={totalShareBytes} />
            </>
          ) : null}
          {belowMin ? (
            <>
              {showBytes ? (
                <span className="text-muted-foreground/30"> · </span>
              ) : null}
              <span className="text-[var(--portal-amber)]">
                min {formatCompactBytes(MIN_SHARED_STORAGE_BYTES)} per recipient
              </span>
            </>
          ) : null}
        </p>
      ) : null}
    </div>
  );
}

function SharePoolAddMoreToggle({
  expanded,
  onToggle,
}: {
  expanded: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      aria-expanded={expanded}
      onClick={onToggle}
      className="group inline-flex shrink-0 items-center gap-0.5 portal-type-label text-[var(--portal-blue)] transition-colors hover:text-[var(--portal-blue-hover)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-border/60"
    >
      Add more
      <ChevronDown
        className={cn(
          'h-3 w-3 transition-transform duration-200',
          expanded && 'rotate-180'
        )}
      />
    </button>
  );
}

function SharePoolReadout({
  summary,
  loading,
  canAddCapacity,
  showAddCapacity,
  onToggleAddCapacity,
}: {
  summary: SharedStoragePoolSummary | null;
  loading: boolean;
  canAddCapacity: boolean;
  showAddCapacity: boolean;
  onToggleAddCapacity: () => void;
}) {
  if (loading) {
    return (
      <div className="space-y-1" aria-hidden>
        <div className="h-3 w-16 animate-pulse rounded bg-muted/35" />
        <div className="h-1 w-full animate-pulse rounded-full bg-muted/25" />
        <div className="h-3 w-full animate-pulse rounded bg-muted/20" />
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
    <div className="space-y-1">
      <p className={cn(sectionEyebrowClass, compactModalSectionLabelClass)}>
        {SHARE_POOL_LABEL}
      </p>

      {totalCapacityBytes > 0 ? (
        <div className="flex min-h-4 flex-wrap items-center gap-x-1.5 gap-y-1">
          <div
            className={cn(walletMenuProgressTrackSlotClass, 'min-w-0 flex-1')}
            role="progressbar"
            aria-valuenow={sharedBytes}
            aria-valuemin={0}
            aria-valuemax={totalCapacityBytes}
            aria-label={`${formatCompactBytes(sharedBytes)} shared · ${formatCompactBytes(shareBudgetBytes)} to allocate of ${formatCompactBytes(totalCapacityBytes)} capacity`}
          >
            <div className="h-1 w-full overflow-hidden rounded-full bg-[var(--portal-slate-bg)]">
              <div
                className="h-full rounded-full bg-portal-neutral transition-[width] duration-300"
                style={{ width: `${barFill}%` }}
              />
            </div>
          </div>
          <span className="inline shrink-0 whitespace-nowrap font-mono portal-type-micro tabular-nums leading-none">
            <CompactByteAmount bytes={shareBudgetBytes} />
            <span className="text-muted-foreground/35"> / </span>
            <CompactByteAmount bytes={totalCapacityBytes} muted />
          </span>
          {canAddCapacity ? (
            <SharePoolAddMoreToggle
              expanded={showAddCapacity}
              onToggle={onToggleAddCapacity}
            />
          ) : null}
        </div>
      ) : (
        <p className={walletMenuMetricCaptionSlotClass}>Not funded yet</p>
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
  const issue =
    status === 'empty' ||
    status === 'ready' ||
    status === 'invalid' ||
    status === 'checking'
      ? null
      : (status as ShareRowIssue);

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-1.5">
        <NearAccountField
          id={`storage-share-recipient-${rowId}`}
          variant="editable"
          density="compact"
          value={value}
          onValueChange={onValueChange}
          className="min-w-0 flex-1"
          requirePortalProfile={false}
        />
        {allocationBytes != null && allocationBytes > 0 ? (
          <CompactByteAmount bytes={allocationBytes} />
        ) : null}
        {canRemove ? (
          <button
            type="button"
            onClick={onRemove}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-border/40 text-muted-foreground/55 transition-colors hover:border-border/60 hover:text-foreground"
            aria-label="Remove recipient"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        ) : null}
      </div>
      {issue ? (
        <p className="portal-type-micro text-[var(--portal-amber)]">
          {shareRowIssueMessage(issue)}
        </p>
      ) : null}
    </div>
  );
}

function SharePoolFundSection({
  poolOwnerId,
  fundAmountInput,
  amountHint,
  walletNearYocto,
  pending,
  canFundAmount,
  error,
  submitLabel,
  onAmountChange,
  onAmountBlur,
  onPresetSelect,
  onSubmit,
}: {
  poolOwnerId: string;
  fundAmountInput: string;
  amountHint: string;
  walletNearYocto: bigint | null | undefined;
  pending: boolean;
  canFundAmount: boolean;
  error: string | null;
  submitLabel: string;
  onAmountChange: (value: string) => void;
  onAmountBlur: () => void;
  onPresetSelect: (preset: string) => void;
  onSubmit: () => void;
}) {
  const fundPreviewCapacityBytes = useMemo(
    () => storageCapacityBytesFromNearInput(fundAmountInput),
    [fundAmountInput]
  );

  return (
    <div className="space-y-2">
      <p className="portal-type-micro text-muted-foreground/50">
        Adding to{' '}
        <span className="font-mono text-muted-foreground/70">
          @{poolOwnerId}
        </span>{' '}
        share pool
      </p>

      <div className="portal-field-focus flex items-center gap-2.5 rounded-2xl border border-border/40 bg-background/45 px-3 py-2.5">
        <input
          type="text"
          inputMode="decimal"
          autoComplete="off"
          value={fundAmountInput}
          onChange={(event) => onAmountChange(event.target.value)}
          onBlur={onAmountBlur}
          placeholder={amountHint}
          aria-label="Share pool fund amount in NEAR"
          className={AMOUNT_INPUT_CLASS}
        />
        <div
          className="h-5 w-px shrink-0 divider-v-section"
          aria-hidden="true"
        />
        <span className="inline-flex shrink-0 items-center gap-1.5 text-sm text-muted-foreground">
          <TokenIcon src={NEAR_TOKEN_ICON} label="NEAR" size="md" />
          <span className="portal-type-caption font-medium text-muted-foreground/55">
            NEAR
          </span>
        </span>
      </div>

      <div className={storageModalQuickAmountRowClass}>
        <div className={storageModalQuickAmountSlotClass}>
          <div
            className="flex flex-wrap gap-1.5"
            role="group"
            aria-label="Quick fund amounts"
          >
            {STORAGE_DEPOSIT_PRESETS_NEAR.map((preset) => {
              const selected =
                finalizeAmountInput(
                  fundAmountInput,
                  STORAGE_NEAR_INPUT_DECIMALS
                ) === preset;
              return (
                <SocialSpendAmountPill
                  key={preset}
                  selected={selected}
                  onClick={() => onPresetSelect(preset)}
                >
                  {preset}
                </SocialSpendAmountPill>
              );
            })}
          </div>
        </div>
        <p className="portal-type-micro ml-auto min-h-4 shrink-0 text-right tabular-nums text-muted-foreground/50">
          {fundPreviewCapacityBytes != null && fundPreviewCapacityBytes > 0 ? (
            <>
              ≈{' '}
              <span className="font-mono font-semibold text-portal-neutral">
                {formatCompactBytes(fundPreviewCapacityBytes)}
              </span>
              <span className="text-muted-foreground/35" aria-hidden="true">
                {' '}
                ·{' '}
              </span>
            </>
          ) : null}
          {walletNearYocto != null ? (
            <>
              Balance{' '}
              <span className="text-muted-foreground/70">
                {formatNearCompact(walletNearYocto.toString())}
              </span>
              <span className="text-muted-foreground/35" aria-hidden="true">
                {' '}
                ·{' '}
              </span>
            </>
          ) : null}
          Min {amountHint}
        </p>
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
        disabled={pending || !canFundAmount}
        loading={pending}
        onClick={onSubmit}
      >
        {submitLabel}
      </Button>

      <p className={storageModalHintSlotClass}>{USER_STORAGE_DEPOSIT_HINT}</p>
    </div>
  );
}

function ShareGrantRow({ grant }: { grant: ActiveStorageShareGrant }) {
  const remaining = shareGrantRemainingBytes(grant);
  const usedPercent = shareGrantUsedPercent(grant);
  const fillWidth = grant.usedBytes > 0 ? Math.max(usedPercent, 8) : 0;
  const showUsage = grant.usedBytes > 0;

  return (
    <li className="flex items-center gap-2 py-px portal-type-micro">
      <span
        className="min-w-0 flex-1 truncate font-mono text-muted-foreground/75"
        title={`@${grant.accountId}`}
      >
        @{grant.accountId}
      </span>
      {showUsage ? (
        <div
          className="h-0.5 w-7 shrink-0 overflow-hidden rounded-full bg-[var(--portal-slate-bg)]"
          role="progressbar"
          aria-valuenow={usedPercent}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={`${grant.accountId} shared storage usage`}
        >
          <div
            className="h-full rounded-full bg-portal-neutral"
            style={{ width: `${fillWidth}%` }}
          />
        </div>
      ) : null}
      <span className="inline shrink-0 whitespace-nowrap leading-none">
        {showUsage ? (
          <>
            <CompactByteAmount bytes={grant.usedBytes} muted />
            <span className="font-mono portal-type-micro text-muted-foreground/35">
              {' / '}
            </span>
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
      <div className="space-y-1 pt-0.5" aria-hidden>
        <div className="h-2.5 w-20 animate-pulse rounded bg-muted/35" />
        <div className="space-y-1">
          <div className="h-2.5 w-full animate-pulse rounded bg-muted/25" />
          <div className="h-2.5 w-[92%] animate-pulse rounded bg-muted/20" />
        </div>
      </div>
    );
  }

  const allocatedBytes = grants.reduce(
    (total, grant) => total + grant.maxBytes,
    0
  );
  const usedBytes = grants.reduce((total, grant) => total + grant.usedBytes, 0);

  return (
    <div className="space-y-1">
      <div className="flex items-baseline justify-between gap-2">
        <p className={cn(sectionEyebrowClass, 'mb-0')}>Shared with</p>
        {!error && grants.length > 0 ? (
          <p className="inline-flex items-baseline gap-1 portal-type-micro tabular-nums">
            <span className="font-semibold text-portal-neutral">
              {grants.length}
            </span>
            <span className="text-muted-foreground/35">·</span>
            <CompactByteAmount bytes={allocatedBytes} />
            {usedBytes > 0 ? (
              <>
                <span className="text-muted-foreground/35">·</span>
                <CompactByteAmount bytes={usedBytes} muted />
                <span className="text-muted-foreground/45">used</span>
              </>
            ) : null}
          </p>
        ) : null}
      </div>

      {error ? (
        <p className="portal-type-micro text-muted-foreground/55">
          Active shares unavailable right now.
        </p>
      ) : grants.length === 0 ? (
        <p className="portal-type-micro text-muted-foreground/50">
          No active shares yet.
        </p>
      ) : (
        <ul className="max-h-28 space-y-0 overflow-y-auto">
          {grants.map((grant) => (
            <ShareGrantRow key={grant.accountId} grant={grant} />
          ))}
        </ul>
      )}
    </div>
  );
}

interface WalletStorageSharePanelProps {
  accountId: string;
  refreshKey?: number;
  sharedPool: SharedStoragePoolSummary | null;
  sharedPoolLoading: boolean;
  walletNearYocto: bigint | null | undefined;
  pending: boolean;
  error: string | null;
  setPending: Dispatch<SetStateAction<boolean>>;
  onError: (message: string | null) => void;
  onPoolChanged: () => void;
  getSigningWallet: () => Promise<SigningWallet>;
  trackTransaction: (params: {
    txHashes: string[];
    submittedMessage: string;
    successMessage: string;
    failureMessage?: string;
  }) => Promise<boolean>;
  clearTxResult: () => void;
  setTxResult: (result: { type: 'error'; msg: string }) => void;
  toggleAfterReadout?: ReactNode;
}

export function WalletStorageSharePanel({
  accountId,
  refreshKey = 0,
  sharedPool,
  sharedPoolLoading,
  walletNearYocto,
  pending,
  error,
  setPending,
  onError,
  onPoolChanged,
  getSigningWallet,
  trackTransaction,
  clearTxResult,
  setTxResult,
  toggleAfterReadout,
}: WalletStorageSharePanelProps) {
  const baseId = useId();
  const reduceMotion = useReducedMotion();
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
  const needsFunding = !sharedPool || totalCapacityBytes <= 0;
  const showFundPanel = needsFunding || showAddCapacity;
  const showShareFlow = !showFundPanel;
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
      minYocto: STORAGE_DEPOSIT_MIN_YOCTO,
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
        minYocto: STORAGE_DEPOSIT_MIN_YOCTO,
        maxYocto: walletNearYocto ?? undefined,
      });
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Invalid amount.');
      return;
    }

    onError(null);
    clearTxResult();
    setPending(true);

    let txHashes: string[] = [];
    try {
      txHashes = await sendStorageSharedPoolDepositTransaction(
        getSigningWallet,
        accountId,
        amountYocto.toString()
      );
    } catch (err) {
      if (isWalletUserCancellation(err)) return;
      reportWalletActionFailure(err, (message) => {
        onError(message);
        setTxResult({ type: 'error', msg: message });
      });
      return;
    } finally {
      setPending(false);
    }

    if (txHashes.length === 0) return;

    try {
      const confirmed = await trackTransaction({
        txHashes,
        submittedMessage: txToastPending.fundingSharePool,
        successMessage: txToastSuccess.sharePoolFunded,
        failureMessage: txToastError.sharePoolFundFailed,
      });

      if (confirmed) {
        setShowAddCapacity(false);
        onPoolChanged();
      }
    } catch (err) {
      reportWalletActionFailure(err, (message) => {
        onError(message);
        setTxResult({ type: 'error', msg: message });
      });
    }
  };

  const handleShare = async () => {
    if (!canShare) return;

    onError(null);
    clearTxResult();
    setPending(true);

    let txHashes: string[] = [];
    try {
      txHashes = await sendStorageShareBatchTransaction(
        getSigningWallet,
        readyRecipients.map((targetAccountId) => ({
          targetAccountId,
          maxBytes: bytesPerRecipient,
        }))
      );
    } catch (err) {
      if (isWalletUserCancellation(err)) return;
      reportWalletActionFailure(err, (message) => {
        onError(message);
        setTxResult({ type: 'error', msg: message });
      });
      return;
    } finally {
      setPending(false);
    }

    if (txHashes.length === 0) return;

    try {
      const confirmed = await trackTransaction({
        txHashes,
        submittedMessage: txToastPending.sharingStorage,
        successMessage: txToastSuccess.storageShared,
        failureMessage: txToastError.storageShareFailed,
      });

      if (confirmed) {
        setPendingShareTargets((current) => [
          ...new Set([...current, ...readyRecipients]),
        ]);
        setRows(['']);
        onPoolChanged();
      }
    } catch (err) {
      reportWalletActionFailure(err, (message) => {
        onError(message);
        setTxResult({ type: 'error', msg: message });
      });
    }
  };

  const amountHint = formatStorageMinNearLabel(STORAGE_DEPOSIT_MIN_YOCTO);
  const totalShareBytes = bytesPerRecipient * readyRecipients.length;
  const fundPanelMotion = reduceMotion
    ? {}
    : {
        initial: portalCollapseMotion.initial,
        animate: portalCollapseMotion.animate,
        exit: portalCollapseMotion.exit,
        transition: portalCollapseMotion.transition,
      };

  return (
    <>
      <SharePoolReadout
        summary={sharedPool}
        loading={sharedPoolLoading}
        canAddCapacity={!needsFunding && !sharedPoolLoading}
        showAddCapacity={showAddCapacity}
        onToggleAddCapacity={() => setShowAddCapacity((open) => !open)}
      />

      <div className="mt-3 space-y-3">
        {toggleAfterReadout}

        <AnimatePresence initial={false}>
          {showFundPanel ? (
            <motion.div
              key="share-pool-fund"
              {...fundPanelMotion}
              className="overflow-hidden border-t border-fade-detail pt-2"
            >
              <SharePoolFundSection
                poolOwnerId={accountId}
                fundAmountInput={fundAmountInput}
                amountHint={amountHint}
                walletNearYocto={walletNearYocto}
                pending={pending}
                canFundAmount={canFundAmount}
                error={error}
                submitLabel={
                  needsFunding ? 'Fund share pool' : 'Add to share pool'
                }
                onAmountChange={applyFundAmountInput}
                onAmountBlur={() =>
                  applyFundAmountInput(
                    finalizeAmountInput(
                      fundAmountInput,
                      STORAGE_NEAR_INPUT_DECIMALS
                    )
                  )
                }
                onPresetSelect={applyFundAmountInput}
                onSubmit={() => {
                  void handleFundPool();
                }}
              />
            </motion.div>
          ) : null}
        </AnimatePresence>

        <AnimatePresence initial={false}>
          {showShareFlow ? (
            <motion.div
              key="share-flow"
              {...fundPanelMotion}
              className="space-y-3 overflow-hidden"
            >
              <StorageSharesGrantedReadout
                grants={activeShares.grants}
                loading={activeShares.loading}
                error={activeShares.error}
              />

              <div className="space-y-2 border-t border-fade-detail pt-3">
                <div className="flex items-center justify-between gap-2">
                  <p
                    className={cn(
                      sectionEyebrowClass,
                      compactModalSectionLabelClass,
                      'mb-0'
                    )}
                  >
                    Recipients
                  </p>
                  <button
                    type="button"
                    onClick={addRow}
                    disabled={rows.length >= MAX_STORAGE_SHARE_RECIPIENTS}
                    className={cn(
                      'inline-flex items-center gap-1 portal-type-label text-[var(--portal-blue)] transition-colors hover:text-[var(--portal-blue-hover)]',
                      rows.length >= MAX_STORAGE_SHARE_RECIPIENTS &&
                        'cursor-not-allowed opacity-45'
                    )}
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Add recipient
                  </button>
                </div>

                <div className="space-y-1.5">
                  {rows.map((row, index) => {
                    const status =
                      recipientValidation.statuses[index] ?? 'empty';
                    return (
                      <ShareRecipientRow
                        key={`${baseId}-${index}`}
                        rowId={`${index}`}
                        value={row}
                        status={status}
                        allocationBytes={
                          status === 'ready' &&
                          !needsFunding &&
                          bytesPerRecipient > 0
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

                <div className="space-y-2 pt-1">
                  <div
                    className="flex flex-wrap gap-1"
                    role="group"
                    aria-label="Share pool percent"
                  >
                    {STORAGE_SHARE_PERCENT_PRESETS.map((preset) => (
                      <SocialSpendAmountPill
                        key={preset}
                        selected={sharePercent === preset}
                        onClick={() => setSharePercent(preset)}
                      >
                        {preset === 100 ? 'Max' : `${preset}%`}
                      </SocialSpendAmountPill>
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
                  <p className="rounded-xl border border-[var(--portal-red-border)] bg-[var(--portal-red-bg)] px-2.5 py-2 portal-type-caption leading-relaxed text-[var(--portal-red)]">
                    {error}
                  </p>
                ) : null}

                {!needsFunding ? (
                  <Button
                    type="button"
                    variant="accent"
                    size="sm"
                    className="h-10 w-full"
                    disabled={pending || !canShare}
                    loading={pending}
                    onClick={() => {
                      void handleShare();
                    }}
                  >
                    Share storage
                  </Button>
                ) : null}

                {!needsFunding ? (
                  <p className={storageModalHintSlotClass}>
                    {USER_STORAGE_SHARE_HINT}
                  </p>
                ) : null}
              </div>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>
    </>
  );
}
