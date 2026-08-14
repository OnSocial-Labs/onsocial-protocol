'use client';

import type { FocusEventHandler, ReactNode } from 'react';
import {
  Divider,
  osFieldBorderedClassName,
  osFieldSoftClassName,
} from '@onsocial/ui';
import { finalizeAmountInput, normalizeAmountInput } from '@/lib/amount-input';

export type AmountFieldChrome = 'bordered' | 'soft';

/**
 * Shared money input shell — `app-storage-amount-field` + unit.
 * `chrome="bordered"` (default): transparent fill + detail divider + unit rail
 * so glass / mood tint shows through. `chrome="soft"`: quiet wash off glass.
 * Pair with {@link AmountFieldMetaRow} for presets / Max / balance.
 * Use `display` for read-only legs (swap receive).
 */
export function AmountField({
  value = '',
  onValueChange,
  unit,
  unitIcon,
  chrome = 'bordered',
  maxDecimals,
  placeholder,
  disabled = false,
  invalid = false,
  id,
  'aria-label': ariaLabel,
  onFocus,
  className,
  inputClassName,
  trailing,
  display,
}: {
  value?: string;
  onValueChange?: (value: string) => void;
  /** Unit label when `trailing` is omitted — e.g. `NEAR`, `SOCIAL`, `%`. */
  unit?: ReactNode;
  unitIcon?: ReactNode;
  chrome?: AmountFieldChrome;
  /** When set, typing is normalized and blur finalizes decimals. */
  maxDecimals?: number;
  placeholder?: string;
  disabled?: boolean;
  invalid?: boolean;
  id?: string;
  'aria-label': string;
  onFocus?: FocusEventHandler<HTMLInputElement>;
  className?: string;
  inputClassName?: string;
  /** Replaces the default unit span (swap token picker, etc.). */
  trailing?: ReactNode;
  /** Read-only content instead of an input (swap receive / estimating). */
  display?: ReactNode;
}) {
  const chromeClass =
    chrome === 'soft' ? osFieldSoftClassName : osFieldBorderedClassName;

  const affix =
    trailing != null ? (
      trailing
    ) : unit != null ? (
      <span className="account-card-balance-unit profile-support-token-unit">
        {unitIcon}
        {unit}
      </span>
    ) : null;

  const emit = (raw: string) => {
    if (!onValueChange) return;
    if (maxDecimals == null) {
      onValueChange(raw);
      return;
    }
    onValueChange(normalizeAmountInput(raw, maxDecimals));
  };

  const emitBlur = () => {
    if (!onValueChange || maxDecimals == null) return;
    onValueChange(finalizeAmountInput(value, maxDecimals));
  };

  return (
    <div
      className={
        className
          ? `app-storage-amount-field ${chromeClass} ${className}`
          : `app-storage-amount-field ${chromeClass}`
      }
      aria-label={display != null ? ariaLabel : undefined}
    >
      {display != null ? (
        display
      ) : (
        <input
          id={id}
          type="text"
          inputMode="decimal"
          autoComplete="off"
          value={value}
          onChange={(event) => emit(event.target.value)}
          onBlur={emitBlur}
          onFocus={onFocus}
          placeholder={placeholder}
          aria-label={ariaLabel}
          aria-invalid={invalid || undefined}
          className={
            inputClassName
              ? `app-storage-amount-input ${inputClassName}`
              : 'app-storage-amount-input'
          }
          disabled={disabled}
        />
      )}
      {affix != null ? (
        <>
          <Divider
            orientation="vertical"
            variant="detail"
            className="app-storage-amount-divider"
          />
          {affix}
        </>
      ) : null}
    </div>
  );
}
