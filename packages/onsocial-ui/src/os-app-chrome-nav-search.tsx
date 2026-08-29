'use client';

import type { FocusEventHandler, ReactNode } from 'react';
import { SearchField } from './search-field.js';

export const osAppChromeNavSearchClassName = 'os-app-chrome-nav-search';
export const osAppChromeNavSearchIdleClassName = 'os-app-screen-search';

/**
 * Compact nav-row search — same pill on phone and desktop. Leave stays in the
 * dock. Focused down-chevron sits left of the shop / search mark. X clears.
 */
export function OsAppChromeNavSearch({
  value,
  onValueChange,
  placeholder = 'Search',
  maxLength = 80,
  clearAriaLabel = 'Clear search',
  ariaLabel,
  leadingIcon,
  idleClassName = '',
  onActiveChange,
  onFocus,
  onBlur,
}: {
  value: string;
  onValueChange: (value: string) => void;
  placeholder?: string;
  maxLength?: number;
  clearAriaLabel?: string;
  ariaLabel?: string;
  leadingIcon?: ReactNode;
  /** Extra classes on SearchField (e.g. discover-nav-search-field). */
  idleClassName?: string;
  onActiveChange?: (active: boolean) => void;
  onFocus?: FocusEventHandler<HTMLInputElement>;
  onBlur?: FocusEventHandler<HTMLInputElement>;
}) {
  const handleFocus: FocusEventHandler<HTMLInputElement> = (event) => {
    onActiveChange?.(true);
    onFocus?.(event);
  };
  const handleBlur: FocusEventHandler<HTMLInputElement> = (event) => {
    onActiveChange?.(false);
    onBlur?.(event);
  };

  return (
    <div data-sheet-initial-focus-skip="">
      <SearchField
        value={value}
        onValueChange={onValueChange}
        placeholder={placeholder}
        maxLength={maxLength}
        clearAriaLabel={clearAriaLabel}
        ariaLabel={ariaLabel ?? placeholder}
        className={`${osAppChromeNavSearchIdleClassName}${idleClassName ? ` ${idleClassName}` : ''}`}
        leadingIcon={leadingIcon}
        onFocus={handleFocus}
        onBlur={handleBlur}
      />
    </div>
  );
}
