'use client';

import type { ReactNode } from 'react';
import { Divider } from './divider.js';
import { osFieldBorderedClassName, osFieldSoftClassName } from './os-field.js';
import { cn } from './cn.js';

export type OsAccountFieldChrome = 'bordered' | 'soft';

export const osAccountFieldClassName = 'os-account-field';

/**
 * Presentational account type-in — leading slot + detail divider + input.
 * Host owns sanitization / on-chain probe / avatar resolution.
 * Pair with `os-account-field.css`. Legacy alias: `.near-account-field`.
 */
export function OsAccountField({
  id,
  value,
  onValueChange,
  disabled = false,
  placeholder,
  chrome = 'bordered',
  statusClass,
  leading,
  'aria-invalid': ariaInvalid,
  'aria-label': ariaLabel,
  className,
  inputClassName,
}: {
  id: string;
  value: string;
  onValueChange: (value: string) => void;
  disabled?: boolean;
  placeholder: string;
  chrome?: OsAccountFieldChrome;
  /** e.g. `is-available` / `is-taken` — tints the field top lip. */
  statusClass?: string;
  /** Permanent leading slot (avatar / shimmer). */
  leading?: ReactNode;
  'aria-invalid'?: boolean;
  'aria-label'?: string;
  className?: string;
  inputClassName?: string;
}) {
  const chromeClass =
    chrome === 'soft' ? osFieldSoftClassName : osFieldBorderedClassName;

  return (
    <div
      className={cn(
        osAccountFieldClassName,
        'near-account-field',
        chromeClass,
        statusClass,
        className
      )}
    >
      {leading != null ? (
        <span
          className="os-account-field-leading near-account-field-leading"
          aria-hidden
        >
          {leading}
        </span>
      ) : null}
      {leading != null ? (
        <Divider
          orientation="vertical"
          variant="detail"
          className="os-account-field-divider near-account-field-divider"
        />
      ) : null}
      <input
        id={id}
        type="text"
        autoComplete="off"
        spellCheck={false}
        autoCapitalize="none"
        autoCorrect="off"
        value={value}
        disabled={disabled}
        placeholder={placeholder}
        aria-invalid={ariaInvalid}
        aria-label={ariaLabel}
        className={inputClassName}
        onChange={(event) => onValueChange(event.target.value)}
      />
    </div>
  );
}
