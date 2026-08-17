'use client';

import type { FocusEventHandler, ReactNode } from 'react';
import { Divider } from './divider.js';
import { finalizeAmountInput, normalizeAmountInput } from './amount-input.js';
import { osFieldBorderedClassName, osFieldSoftClassName } from './os-field.js';
import { cn } from './cn.js';

export type AmountFieldChrome = 'bordered' | 'soft';

export const osAmountFieldClassName = 'os-amount-field';
export const osAmountFieldInputClassName = 'os-amount-field-input';
export const osAmountFieldDividerClassName = 'os-amount-field-divider';
export const osAmountFieldUnitClassName = 'os-amount-field-unit';

/**
 * Shared money input shell — bordered (default) or soft chrome.
 * Pair with host meta rows for presets / Max / balance.
 * Use `display` for read-only legs (swap receive).
 *
 * Class aliases: `.app-storage-amount-field` / `.app-storage-amount-input`
 * (legacy app selectors).
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
      <span
        className={cn(
          osAmountFieldUnitClassName,
          'account-card-balance-unit',
          'profile-support-token-unit'
        )}
      >
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
      className={cn(
        osAmountFieldClassName,
        'app-storage-amount-field',
        chromeClass,
        className
      )}
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
          className={cn(
            osAmountFieldInputClassName,
            'app-storage-amount-input',
            inputClassName
          )}
          disabled={disabled}
        />
      )}
      {affix != null ? (
        <>
          <Divider
            orientation="vertical"
            variant="detail"
            className={cn(
              osAmountFieldDividerClassName,
              'app-storage-amount-divider'
            )}
          />
          {affix}
        </>
      ) : null}
    </div>
  );
}
