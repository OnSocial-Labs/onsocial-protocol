'use client';

import type {
  FocusEventHandler,
  InputHTMLAttributes,
  ReactNode,
} from 'react';
import {
  Divider,
  osFieldBorderedClassName,
  osFieldSoftClassName,
} from '@onsocial/ui';

export type SuffixFieldChrome = 'soft' | 'bordered';

/**
 * Value + trailing unit shell — counts, weights, `% per sale`.
 * Bordered (default): transparent fill + detail divider + type-only unit rail
 * so mood / glass shows through — use on mood surfaces.
 * Soft: quiet wash for non-mood / dense stacks.
 * Money stays on {@link AmountField} (mono amount chrome + decimal helpers).
 */
export function SuffixField({
  value,
  onValueChange,
  suffix,
  chrome = 'bordered',
  inputMode = 'numeric',
  placeholder,
  disabled = false,
  invalid = false,
  id,
  'aria-label': ariaLabel,
  onFocus,
  onBlur,
  className,
  inputClassName,
}: {
  value: string;
  onValueChange: (value: string) => void;
  suffix?: ReactNode;
  chrome?: SuffixFieldChrome;
  inputMode?: InputHTMLAttributes<HTMLInputElement>['inputMode'];
  placeholder?: string;
  disabled?: boolean;
  invalid?: boolean;
  id?: string;
  'aria-label': string;
  onFocus?: FocusEventHandler<HTMLInputElement>;
  onBlur?: FocusEventHandler<HTMLInputElement>;
  className?: string;
  inputClassName?: string;
}) {
  const chromeClass =
    chrome === 'soft' ? osFieldSoftClassName : osFieldBorderedClassName;

  return (
    <div
      className={
        className
          ? `suffix-field ${chromeClass} ${className}`
          : `suffix-field ${chromeClass}`
      }
    >
      <input
        id={id}
        type="text"
        inputMode={inputMode}
        autoComplete="off"
        value={value}
        onChange={(event) => onValueChange(event.target.value)}
        onFocus={onFocus}
        onBlur={onBlur}
        placeholder={placeholder}
        aria-label={ariaLabel}
        aria-invalid={invalid || undefined}
        className={
          inputClassName
            ? `suffix-field-input ${inputClassName}`
            : 'suffix-field-input'
        }
        disabled={disabled}
      />
      {suffix != null ? (
        <>
          <Divider
            orientation="vertical"
            variant="detail"
            className="suffix-field-divider"
          />
          <span className="suffix-field-unit">{suffix}</span>
        </>
      ) : null}
    </div>
  );
}
