'use client';

import type { FocusEventHandler, InputHTMLAttributes, ReactNode } from 'react';
import { Divider } from './divider.js';
import { osFieldBorderedClassName, osFieldSoftClassName } from './os-field.js';
import { cn } from './cn.js';

export type SuffixFieldChrome = 'soft' | 'bordered';

export const osSuffixFieldClassName = 'os-suffix-field';
export const osSuffixFieldInputClassName = 'os-suffix-field-input';
export const osSuffixFieldDividerClassName = 'os-suffix-field-divider';
export const osSuffixFieldUnitClassName = 'os-suffix-field-unit';

/**
 * Value + trailing unit shell — counts, weights, `% per sale`.
 * Bordered (default) so mood / glass shows through. Soft for quiet stacks.
 * Money stays on {@link AmountField}.
 *
 * Class aliases: `.suffix-field` / `.suffix-field-input` (legacy app selectors).
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
      className={cn(
        osSuffixFieldClassName,
        'suffix-field',
        chromeClass,
        className
      )}
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
        className={cn(
          osSuffixFieldInputClassName,
          'suffix-field-input',
          inputClassName
        )}
        disabled={disabled}
      />
      {suffix != null ? (
        <>
          <Divider
            orientation="vertical"
            variant="detail"
            className={cn(
              osSuffixFieldDividerClassName,
              'suffix-field-divider'
            )}
          />
          <span className={cn(osSuffixFieldUnitClassName, 'suffix-field-unit')}>
            {suffix}
          </span>
        </>
      ) : null}
    </div>
  );
}
