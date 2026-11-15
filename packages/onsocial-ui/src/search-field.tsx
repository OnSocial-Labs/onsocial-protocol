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

/** Clear control visibility — filter search has no dismiss / mode exit. */
export function searchFieldTrailing(
  _focused: boolean,
  value: string
): {
  showClear: boolean;
} {
  return {
    showClear: Boolean(value.trim()),
  };
}

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
   * Size via `search-field-icon` / `--os-search-icon-*`. Shows a portal-style
   * vertical divider after the glyph.
   */
  leadingIcon?: ReactNode;
  /** Focus the input on mount (GlassSheet prefers this over the close button). */
  autoFocus?: boolean;
  className?: string;
  onFocus?: FocusEventHandler<HTMLInputElement>;
  onBlur?: FocusEventHandler<HTMLInputElement>;
}

/**
 * Shared filter search — heading + toolbar share one pill, chrome icon ladder
 * (0.72→0.92), full-fg typed text, proportional clear ×; focus clears fill +
 * hint. Pair with `search-field.css`.
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
  autoFocus = false,
  className = '',
  onFocus,
  onBlur,
}: SearchFieldProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const branded = Boolean(leadingIcon);
  const { showClear } = searchFieldTrailing(false, value);

  const handleClear = useCallback(() => {
    onValueChange('');
    inputRef.current?.focus();
  }, [onValueChange]);

  const chromeClass =
    chrome === 'floating-panel' ? 'os-floating-panel-search' : 'sheet-control';

  return (
    <div
      className={`search-field${branded ? ' search-field--branded' : ''} ${chromeClass}${className ? ` ${className}` : ''}`}
    >
      <label className="search-field-core">
        <span className="search-field-leading">
          {leadingIcon ?? (
            <SearchIcon className="search-field-icon" aria-hidden />
          )}
        </span>
        {branded ? (
          <Divider
            orientation="vertical"
            variant="detail"
            className="search-field-divider self-center"
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
          autoFocus={autoFocus}
          className="search-field-input"
        />
      </label>
      {showClear ? (
        <button
          type="button"
          className="search-field-clear"
          onClick={handleClear}
          aria-label={clearAriaLabel}
        >
          <MultiplyIcon className="search-field-clear-icon" aria-hidden />
        </button>
      ) : null}
    </div>
  );
}
