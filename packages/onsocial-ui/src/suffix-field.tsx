'use client';

import type { FocusEventHandler, InputHTMLAttributes, ReactNode } from 'react';
import { Divider } from './divider.js';
import {
  OsFieldPlainValue,
  osAffixChromeClassName,
  type OsAffixChrome,
} from './os-field.js';
import { cn } from './cn.js';

export type SuffixFieldChrome = OsAffixChrome;

export const osSuffixFieldClassName = 'os-suffix-field';
export const osSuffixFieldInputClassName = 'os-suffix-field-input';
export const osSuffixFieldDividerClassName = 'os-suffix-field-divider';
export const osSuffixFieldUnitClassName = 'os-suffix-field-unit';

/**
 * Value + trailing unit shell — counts, weights, `% per sale`.
 * Bordered (default) so mood / glass shows through. Soft for quiet stacks.
 * Plain is the spoken line: page face, no box, detail rule under the digits.
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
  const plain = chrome === 'plain';
  const input = (
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
  );

  return (
    <div
      className={cn(
        osSuffixFieldClassName,
        'suffix-field',
        osAffixChromeClassName(chrome),
        className
      )}
    >
      {plain ? <OsFieldPlainValue>{input}</OsFieldPlainValue> : input}
      {suffix != null ? (
        <>
          {plain ? null : (
            <Divider
              orientation="vertical"
              variant="detail"
              className={cn(
                osSuffixFieldDividerClassName,
                'suffix-field-divider'
              )}
            />
          )}
          <span className={cn(osSuffixFieldUnitClassName, 'suffix-field-unit')}>
            {suffix}
          </span>
        </>
      ) : null}
    </div>
  );
}
