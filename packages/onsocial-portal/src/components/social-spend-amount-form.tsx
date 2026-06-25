'use client';

import type { ChangeEvent, ReactNode } from 'react';
import { useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { TokenIcon } from '@/components/ui/token-icon';
import { SocialSpendAmountPill } from '@/components/social-spend-pill';
import { portalConnectButtonLabel } from '@/lib/portal-connect-copy';
import { portalElevatedShadowClass } from '@/components/ui/floating-panel';
import { useSocialTokenIcon } from '@/hooks/use-social-token-icon';
import { finalizeAmountInput, normalizeAmountInput } from '@/lib/amount-input';
import {
  clampSocialSpendAmountInput,
  formatSpendAmountHint,
  formatSupportBalanceLabel,
  formatSpendMinSocialLabel,
  isValidSocialSpendAmountInput,
  SOCIAL_SPEND_AMOUNT_INPUT_DECIMALS,
  SUPPORT_PROFILE_MIN_YOCTO,
} from '@/lib/social-spend-profile';
import { cn } from '@/lib/utils';

const AMOUNT_INPUT_CLASS =
  'min-w-0 flex-1 bg-transparent font-mono text-lg font-semibold tracking-[-0.02em] text-foreground outline-none placeholder:text-muted-foreground/50 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none';

export function SocialSpendAmountForm({
  amount,
  onAmountChange,
  presetAmounts,
  minAmountYocto,
  walletBalanceYocto,
  pending = false,
  error = null,
  onSubmit,
  submitConnectAction = 'support',
  isWalletBootstrapping = false,
  isConnected = false,
  connectedSubmitLabel = 'Send support',
  facts,
  className,
}: {
  amount: string;
  onAmountChange: (value: string) => void;
  presetAmounts: readonly string[];
  minAmountYocto?: bigint | null;
  walletBalanceYocto?: bigint | null;
  pending?: boolean;
  error?: string | null;
  onSubmit: () => void;
  submitConnectAction?: Parameters<typeof portalConnectButtonLabel>[0];
  isWalletBootstrapping?: boolean;
  isConnected?: boolean;
  connectedSubmitLabel?: string;
  facts?: ReactNode;
  className?: string;
}) {
  const socialIcon = useSocialTokenIcon();
  const minYocto = minAmountYocto ?? SUPPORT_PROFILE_MIN_YOCTO;
  const minSocialLabel = formatSpendMinSocialLabel(minYocto);
  const amountHint = formatSpendAmountHint(minYocto);

  const normalizedAmount = useMemo(
    () => finalizeAmountInput(amount, SOCIAL_SPEND_AMOUNT_INPUT_DECIMALS),
    [amount]
  );

  const walletBalanceLabel =
    walletBalanceYocto != null && walletBalanceYocto > 0n
      ? formatSupportBalanceLabel(walletBalanceYocto)
      : walletBalanceYocto === 0n
        ? '0'
        : null;

  const canSubmitAmount = useMemo(
    () =>
      isValidSocialSpendAmountInput(normalizedAmount, {
        minYocto,
        balanceYocto: walletBalanceYocto,
      }),
    [minYocto, normalizedAmount, walletBalanceYocto]
  );

  const submitLabel = portalConnectButtonLabel(submitConnectAction, {
    isWalletBootstrapping,
    isConnected,
    connectedLabel: connectedSubmitLabel,
  });

  const submitDisabled =
    pending || isWalletBootstrapping || (isConnected && !canSubmitAmount);

  const applyAmountInput = (raw: string) => {
    const normalized = normalizeAmountInput(
      raw,
      SOCIAL_SPEND_AMOUNT_INPUT_DECIMALS
    );
    onAmountChange(
      clampSocialSpendAmountInput(normalized, {
        balanceYocto: walletBalanceYocto,
      })
    );
  };

  const handleAmountChange = (event: ChangeEvent<HTMLInputElement>) => {
    applyAmountInput(event.target.value);
  };

  const handleAmountBlur = () => {
    onAmountChange(
      clampSocialSpendAmountInput(normalizedAmount, {
        balanceYocto: walletBalanceYocto,
      })
    );
  };

  const handlePresetSelect = (preset: string) => {
    let next = finalizeAmountInput(preset, SOCIAL_SPEND_AMOUNT_INPUT_DECIMALS);
    next = clampSocialSpendAmountInput(next, {
      balanceYocto: walletBalanceYocto,
    });
    onAmountChange(next);
  };

  return (
    <div className={cn('space-y-3', className)}>
      <div className="space-y-2">
        <div className="portal-field-focus flex items-center gap-2.5 rounded-2xl border border-border/40 bg-background/45 px-3 py-2.5">
          <input
            type="text"
            inputMode="decimal"
            autoComplete="off"
            value={amount}
            onChange={handleAmountChange}
            onBlur={handleAmountBlur}
            placeholder={amountHint}
            aria-label="Amount in SOCIAL"
            aria-invalid={isConnected && !canSubmitAmount && Boolean(amount)}
            className={AMOUNT_INPUT_CLASS}
          />
          <div
            className="h-5 w-px shrink-0 divider-v-section"
            aria-hidden="true"
          />
          <span className="inline-flex shrink-0 items-center gap-1.5 text-sm text-muted-foreground">
            <TokenIcon src={socialIcon} label="SOCIAL" size="md" />
            <span className="portal-type-caption font-medium text-muted-foreground/55">
              SOCIAL
            </span>
          </span>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5">
          {presetAmounts.length > 0 ? (
            <div
              className="flex flex-wrap gap-1.5"
              role="group"
              aria-label="Quick amounts"
            >
              {presetAmounts.map((preset) => {
                const selected = normalizedAmount === preset;
                return (
                  <SocialSpendAmountPill
                    key={preset}
                    selected={selected}
                    onClick={() => handlePresetSelect(preset)}
                  >
                    {preset}
                  </SocialSpendAmountPill>
                );
              })}
            </div>
          ) : null}

          <p
            className={cn(
              'portal-type-micro tabular-nums text-muted-foreground/50',
              presetAmounts.length > 0
                ? 'ml-auto shrink-0 text-right'
                : 'w-full text-right'
            )}
          >
            {walletBalanceLabel != null ? (
              <>
                Balance{' '}
                <span className="text-muted-foreground/70">
                  {walletBalanceLabel}
                </span>
                <span className="text-muted-foreground/35" aria-hidden="true">
                  {' '}
                  ·{' '}
                </span>
              </>
            ) : null}
            Min {minSocialLabel === '0' ? amountHint : minSocialLabel}
          </p>
        </div>

        {facts}
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
        loading={pending}
        disabled={submitDisabled}
        onClick={onSubmit}
      >
        {submitLabel}
      </Button>
    </div>
  );
}

export function socialSpendModalShellClass(className?: string) {
  return cn(
    'relative z-10 flex max-h-[min(560px,calc(100vh-2rem))] w-full max-w-sm flex-col overflow-hidden rounded-2xl border border-border/67 bg-background/98',
    portalElevatedShadowClass,
    className
  );
}

export const socialSpendModalBodyClass =
  'min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-4 pt-3 md:px-5';
