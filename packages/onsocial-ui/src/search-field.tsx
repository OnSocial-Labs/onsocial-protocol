'use client';

import {
  useCallback,
  useRef,
  type FocusEventHandler,
  type ReactNode,
} from 'react';
import { Divider } from './divider.js';
import { MultiplyIcon, SearchIcon } from './mage-stroke-icons.js';

export const searchFieldClassName = 'search-field';

export interface SearchFieldProps {
  value: string;
  onValueChange: (value: string) => void;
  placeholder?: string;
  maxLength?: number;
  clearAriaLabel?: string;
  ariaLabel?: string;
  /** `sheet` — flat glass control; `floating-panel` — Portal filter-rail pill. */
  chrome?: 'sheet' | 'floating-panel';
  /**
   * Replaces the default magnifying glass (e.g. Market shop / Discover mark).
   * Pass a single icon sized via `search-field-icon`. Shows a portal-style
   * vertical divider after the glyph.
   */
  leadingIcon?: ReactNode;
  className?: string;
  onFocus?: FocusEventHandler<HTMLInputElement>;
  onBlur?: FocusEventHandler<HTMLInputElement>;
}

/**
 * Shared search input. Pair with `search-field.css`; the `sheet` chrome class
 * (`sheet-control`) is styled by the host app, `floating-panel` by
 * `floating-panel.css`.
 */
export function SearchField({
  value,
  onValueChange,
  placeholder = 'Search',
  maxLength = 80,
  clearAriaLabel = 'Clear search',
  ariaLabel,
  chrome = 'sheet',
  leadingIcon,
  className = '',
  onFocus,
  onBlur,
}: SearchFieldProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const branded = Boolean(leadingIcon);

  const handleClear = useCallback(() => {
    onValueChange('');
    inputRef.current?.focus();
  }, [onValueChange]);

  const chromeClass =
    chrome === 'floating-panel' ? 'os-floating-panel-search' : 'sheet-control';

  return (
    <label
      className={`search-field${branded ? ' search-field--branded' : ''} ${chromeClass}${className ? ` ${className}` : ''}`}
    >
      <span className="search-field-leading">
        {leadingIcon ?? (
          <SearchIcon className="search-field-icon" aria-hidden />
        )}
      </span>
      {branded ? (
        <Divider
          orientation="vertical"
          variant="detail"
          className="search-field-divider"
        />
      ) : null}
      <input
        ref={inputRef}
        type="text"
        inputMode="search"
        enterKeyHint="search"
        value={value}
        onChange={(event) => onValueChange(event.target.value)}
        onFocus={onFocus}
        onBlur={onBlur}
        placeholder={placeholder}
        maxLength={maxLength}
        aria-label={ariaLabel ?? placeholder}
        className="search-field-input"
      />
      <span className="search-field-clear-slot" aria-hidden={!value.trim()}>
        {value.trim() ? (
          <button
            type="button"
            className="search-field-clear"
            onClick={handleClear}
            aria-label={clearAriaLabel}
          >
            <MultiplyIcon className="search-field-clear-icon" aria-hidden />
          </button>
        ) : null}
      </span>
    </label>
  );
}
