'use client';

import type { ReactNode } from 'react';
import {
  AmountField,
  AmountFieldMetaRow,
  TokenIcon,
} from '@onsocial/ui';
import { useSocialTokenIcon } from '@/hooks/use-social-token-icon';
import { finalizeAmountInput } from '@/lib/amount-input';
import { yoctoToSocial } from '@/lib/format-social-balance';
import {
  clampSocialSpendAmountInput,
  SOCIAL_SPEND_AMOUNT_INPUT_DECIMALS,
} from '@/lib/social-spend-profile';

export function parseProtocolComposeMaxYocto(
  value: string | bigint | null | undefined
): bigint {
  if (value == null) return 0n;
  if (typeof value === 'bigint') return value < 0n ? 0n : value;
  try {
    const parsed = BigInt(value.trim() || '0');
    return parsed < 0n ? 0n : parsed;
  } catch {
    return 0n;
  }
}

export function formatProtocolComposeMaxAmount(
  maxYocto: string | bigint,
  maxDecimals: number = SOCIAL_SPEND_AMOUNT_INPUT_DECIMALS,
  toDisplay: (yocto: string) => string = yoctoToSocial
): string {
  const max = parseProtocolComposeMaxYocto(maxYocto);
  if (max <= 0n) return '0';
  return finalizeAmountInput(toDisplay(max.toString()), maxDecimals);
}

/** Clamp SOCIAL compose typing to an on-chain cap (stake / support pattern). */
export function applyProtocolComposeSocialAmountInput(
  raw: string,
  maxYocto: string | bigint,
  maxDecimals: number = SOCIAL_SPEND_AMOUNT_INPUT_DECIMALS
): string {
  const max = parseProtocolComposeMaxYocto(maxYocto);
  return clampSocialSpendAmountInput(raw, {
    maxDecimals,
    balanceYocto: max > 0n ? max : null,
  });
}

/**
 * Compose-sheet money input — sanitized {@link AmountField} plus on-chain Max
 * (same stack as stake / support flows).
 */
export function ProtocolComposeAmountField({
  id,
  label,
  value,
  onValueChange,
  disabled = false,
  unit = 'SOCIAL',
  showSocialIcon = unit === 'SOCIAL',
  maxDecimals = SOCIAL_SPEND_AMOUNT_INPUT_DECIMALS,
  maxYocto = '0',
  maxDisabled = false,
  maxLabel = 'Max',
  maxAvailable,
  formatMaxAmount,
  meta,
  note,
  invalid = false,
  tokenIconSrc,
  clampInputToMax = false,
}: {
  id?: string;
  label: string;
  value: string;
  onValueChange: (value: string) => void;
  disabled?: boolean;
  unit?: string;
  showSocialIcon?: boolean;
  maxDecimals?: number;
  maxYocto?: string | bigint;
  maxDisabled?: boolean;
  maxLabel?: string;
  maxAvailable?: boolean;
  formatMaxAmount?: (maxYocto: string | bigint) => string;
  meta?: ReactNode;
  note?: ReactNode;
  invalid?: boolean;
  /** Non-SOCIAL unit mark (NEAR / FT) — always compose-sized `sm`. */
  tokenIconSrc?: string | null;
  /** SOCIAL-only — cap keystrokes to `maxYocto` while typing. */
  clampInputToMax?: boolean;
}) {
  const socialIcon = useSocialTokenIcon(showSocialIcon && tokenIconSrc == null);
  const max = parseProtocolComposeMaxYocto(maxYocto);
  const canMax = maxAvailable ?? max > 0n;
  const applyAmountInput = (raw: string) => {
    if (!clampInputToMax) {
      onValueChange(raw);
      return;
    }
    onValueChange(applyProtocolComposeSocialAmountInput(raw, max, maxDecimals));
  };

  return (
    <div className="guild-field protocol-compose-amount">
      <span>{label}</span>
      <AmountField
        id={id}
        value={value}
        onValueChange={applyAmountInput}
        maxDecimals={maxDecimals}
        placeholder="0"
        aria-label={label}
        invalid={invalid}
        unit={unit}
        unitIcon={
          tokenIconSrc != null ? (
            <TokenIcon src={tokenIconSrc} label={unit} size="sm" />
          ) : showSocialIcon ? (
            <TokenIcon src={socialIcon} label={unit} size="sm" />
          ) : undefined
        }
        disabled={disabled}
      />
      <AmountFieldMetaRow
        tone="support"
        max={{
          onClick: () =>
            applyAmountInput(
              formatMaxAmount
                ? formatMaxAmount(max)
                : formatProtocolComposeMaxAmount(max)
            ),
          disabled: maxDisabled || !canMax,
          label: maxLabel,
          available: canMax,
        }}
        meta={meta}
        disabled={disabled}
      />
      {note}
    </div>
  );
}
