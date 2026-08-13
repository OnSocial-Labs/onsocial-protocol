'use client';

import type {
  FocusEventHandler,
  ReactNode,
} from 'react';
import {
  osFieldBorderedClassName,
  osFieldSoftClassName,
} from '@onsocial/ui';
import { finalizeAmountInput, normalizeAmountInput } from '@/lib/amount-input';

export type AmountFieldChrome = 'bordered' | 'soft';

/**
 * Shared money input shell — `app-storage-amount-field` + unit.
 * Presets / Max / balance stay composed by the caller.
 */
export function AmountField({
  value,
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
}: {
  value: string;
  onValueChange: (value: string) => void;
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
}) {
  const chromeClass =
    chrome === 'soft' ? osFieldSoftClassName : osFieldBorderedClassName;

  const emit = (raw: string) => {
    if (maxDecimals == null) {
      onValueChange(raw);
      return;
    }
    onValueChange(normalizeAmountInput(raw, maxDecimals));
  };

  const emitBlur = () => {
    if (maxDecimals == null) return;
    onValueChange(finalizeAmountInput(value, maxDecimals));
  };

  return (
    <div
      className={
        className
          ? `app-storage-amount-field ${chromeClass} ${className}`
          : `app-storage-amount-field ${chromeClass}`
      }
    >
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
      {trailing != null ? (
        trailing
      ) : unit != null ? (
        <span className="account-card-balance-unit profile-support-token-unit">
          {unitIcon}
          {unit}
        </span>
      ) : null}
    </div>
  );
}
