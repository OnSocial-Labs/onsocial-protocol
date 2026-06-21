'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { Calendar, Info, Lock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { SurfacePanel } from '@/components/ui/surface-panel';
import { cn } from '@/lib/utils';

export function BoostStakeAmountSection({
  mode,
  stakeAmount,
  onStakeAmountChange,
  onStakeAmountBlur,
  onMaxAmount,
  balanceDisplay,
  showBalance,
  tokenIconSrc,
  onTokenIconError,
  isBelowMinimumStake,
  hasInsufficientBalance,
  enteredStakeAmount,
  preview,
  unlockDateLabel,
  stakeButtonLabel,
  onStake,
  isStakeActionDisabled,
  txPending,
  footerNote,
  showUnlockPreview = true,
  amountInputDisabled = false,
  className,
}: {
  mode: 'new' | 'increase';
  stakeAmount: string;
  onStakeAmountChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onStakeAmountBlur: () => void;
  onMaxAmount: () => void;
  balanceDisplay: string;
  showBalance: boolean;
  tokenIconSrc: string | null;
  onTokenIconError: () => void;
  isBelowMinimumStake: boolean;
  hasInsufficientBalance: boolean;
  enteredStakeAmount: boolean;
  preview: {
    showCurrentRows: boolean;
    currentLocked: string;
    addingAmount: string;
    totalLocked: string;
    periodShort: string;
    periodBonus: number;
    periodColor: string;
    influence: string;
  };
  unlockDateLabel: string;
  stakeButtonLabel: string;
  onStake: () => void;
  isStakeActionDisabled: boolean;
  txPending: boolean;
  footerNote?: string;
  showUnlockPreview?: boolean;
  amountInputDisabled?: boolean;
  className?: string;
}) {
  const inputId =
    mode === 'increase' ? 'boost-increase-amount' : 'stake-amount';

  return (
    <div className={cn('space-y-3', className)}>
      <div>
        <div className="mb-2.5 flex items-center justify-between gap-3">
          <label
            htmlFor={inputId}
            className="portal-eyebrow-wide text-muted-foreground"
          >
            Amount
          </label>
          {showBalance ? (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span className="max-w-[8rem] truncate font-mono sm:max-w-none">
                {balanceDisplay}
              </span>
              <Button
                type="button"
                variant="outline"
                size="xs"
                onClick={onMaxAmount}
              >
                Max
              </Button>
            </div>
          ) : null}
        </div>
        <SurfacePanel
          radius="md"
          tone="inset"
          borderTone="subtle"
          padding="none"
          className="portal-blue-focus flex items-center gap-2 px-3 py-2.5 sm:gap-3 sm:px-4 sm:py-3"
        >
          <input
            id={inputId}
            type="text"
            inputMode="decimal"
            value={stakeAmount}
            onChange={onStakeAmountChange}
            onBlur={onStakeAmountBlur}
            placeholder="0"
            disabled={amountInputDisabled}
            autoComplete="off"
            spellCheck={false}
            className={cn(
              'min-w-0 flex-1 truncate bg-transparent text-xl font-semibold tracking-[-0.02em] outline-none placeholder:text-muted-foreground/50 sm:text-2xl',
              amountInputDisabled && 'cursor-not-allowed opacity-60'
            )}
          />
          <span className="flex shrink-0 items-center gap-1.5 text-sm text-muted-foreground">
            {tokenIconSrc ? (
              <img
                src={tokenIconSrc}
                alt=""
                className="h-4 w-4 rounded-full object-cover sm:h-5 sm:w-5"
                onError={onTokenIconError}
              />
            ) : null}
            SOCIAL
          </span>
        </SurfacePanel>
        <div className="mt-2 min-h-5">
          <AnimatePresence initial={false} mode="wait">
            {isBelowMinimumStake ? (
              <motion.div
                key="stake-warning-minimum"
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.18, ease: 'easeOut' }}
                className="flex items-start gap-2 text-xs text-amber-500/90"
              >
                <Info className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
                <span>Minimum stake is 0.01 SOCIAL.</span>
              </motion.div>
            ) : hasInsufficientBalance ? (
              <motion.div
                key="stake-warning-balance"
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.18, ease: 'easeOut' }}
                className="flex items-start gap-2 text-xs text-amber-500/90"
              >
                <Info className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
                <span>Insufficient SOCIAL balance.</span>
              </motion.div>
            ) : null}
          </AnimatePresence>
        </div>
      </div>

      <AnimatePresence initial={false}>
        {enteredStakeAmount ? (
          <motion.div
            key="stake-preview"
            initial={{ opacity: 0, height: 0, y: -6 }}
            animate={{ opacity: 1, height: 'auto', y: 0 }}
            exit={{ opacity: 0, height: 0, y: -6 }}
            transition={{ duration: 0.24, ease: [0.25, 0.1, 0.25, 1] }}
            className="overflow-hidden"
          >
            <div className="rounded-xl border border-border/35 bg-background/35 px-3 py-3">
              <div className="space-y-2 text-sm">
                {preview.showCurrentRows ? (
                  <>
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-muted-foreground">Current</span>
                      <span className="font-mono font-semibold">
                        {preview.currentLocked}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-muted-foreground">Adding</span>
                      <span className="font-semibold">
                        {preview.addingAmount}
                      </span>
                    </div>
                    <div className="h-px divider-detail" />
                  </>
                ) : null}
                <div className="flex items-center justify-between gap-3">
                  <span className="text-muted-foreground">
                    {preview.showCurrentRows ? 'New locked' : 'Locked'}
                  </span>
                  <span className="font-mono font-semibold text-foreground/85">
                    {preview.totalLocked}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-muted-foreground">
                    Bonus ({preview.periodShort})
                  </span>
                  <span
                    className="font-semibold"
                    style={{ color: preview.periodColor }}
                  >
                    +{preview.periodBonus}%
                  </span>
                </div>
                <div className="h-px divider-detail" />
                <div className="flex items-center justify-between gap-3">
                  <span className="font-semibold text-foreground">
                    Influence
                  </span>
                  <span className="portal-green-text font-mono text-base font-bold tracking-[-0.02em] sm:text-lg">
                    {preview.influence}
                  </span>
                </div>
              </div>
              {showUnlockPreview ? (
                <p className="mt-2.5 flex items-center justify-center gap-1.5 portal-type-micro text-muted-foreground">
                  <Calendar className="h-3 w-3" />
                  Unlocks {unlockDateLabel}
                </p>
              ) : null}
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <Button
        type="button"
        onClick={onStake}
        disabled={isStakeActionDisabled}
        loading={txPending}
        loadingIndicatorSize="md"
        size="lg"
        className="w-full gap-1.5 font-semibold"
      >
        <Lock className="h-4 w-4" />
        {stakeButtonLabel}
      </Button>

      {footerNote ? (
        <p className="text-center portal-type-micro leading-snug text-muted-foreground">
          {footerNote}
        </p>
      ) : null}
    </div>
  );
}
