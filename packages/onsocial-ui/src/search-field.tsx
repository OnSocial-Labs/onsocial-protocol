'use client';

import {
  useCallback,
  useRef,
  useState,
  type FocusEventHandler,
  type MouseEvent,
  type ReactNode,
} from 'react';
import { Divider } from './divider.js';
import {
  ChevronDownIcon,
  MultiplyIcon,
  SearchIcon,
} from './mage-stroke-icons.js';

export const searchFieldClassName = 'search-field';

export function searchFieldTrailing(
  focused: boolean,
  value: string
): {
  showClear: boolean;
  showDismiss: boolean;
  dismissSide: 'leading';
} {
  return {
    showClear: Boolean(value.trim()),
    showDismiss: focused,
    dismissSide: 'leading',
  };
}

export interface SearchFieldProps {
  value: string;
  onValueChange: (value: string) => void;
  placeholder?: string;
  maxLength?: number;
  clearAriaLabel?: string;
  dismissAriaLabel?: string;
  ariaLabel?: string;
  /** `sheet` — flat glass control; `floating-panel` — Portal filter-rail pill. */
  chrome?: 'sheet' | 'floating-panel';
  /**
   * Replaces the default magnifying glass (e.g. Market shop / Discover mark).
   * Pass a single icon sized via `search-field-icon`. Shows a portal-style
   * vertical divider after the glyph. Icon + placeholder share the mute →
   * reveal ladder on hover/focus.
   */
  leadingIcon?: ReactNode;
  /** Focus the input on mount (GlassSheet prefers this over the close button). */
  autoFocus?: boolean;
  className?: string;
  onFocus?: FocusEventHandler<HTMLInputElement>;
  onBlur?: FocusEventHandler<HTMLInputElement>;
}

/**
 * Shared search input. Pair with `search-field.css`; the `sheet` chrome class
 * (`sheet-control`) is styled by the host app, `floating-panel` by
 * `floating-panel.css`.
 *
 * Left (focused): down-chevron blurs (keyboard down). Shop / search mark
 * stays. Right: `X` clears and keeps focus. Neither leaves the place.
 */
export function SearchField({
  value,
  onValueChange,
  placeholder = 'Search',
  maxLength = 80,
  clearAriaLabel = 'Clear search',
  dismissAriaLabel = 'Done',
  ariaLabel,
  chrome = 'sheet',
  leadingIcon,
  autoFocus = false,
  className = '',
  onFocus,
  onBlur,
}: SearchFieldProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [focused, setFocused] = useState(false);
  const branded = Boolean(leadingIcon);
  const { showClear, showDismiss } = searchFieldTrailing(focused, value);

  const handleClear = useCallback(() => {
    onValueChange('');
    inputRef.current?.focus();
  }, [onValueChange]);

  const handleFocus: FocusEventHandler<HTMLInputElement> = (event) => {
    setFocused(true);
    onFocus?.(event);
  };

  const handleBlur: FocusEventHandler<HTMLInputElement> = (event) => {
    setFocused(false);
    onBlur?.(event);
  };

  const handleDismissMouseDown = (event: MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
  };

  const handleDismiss = () => {
    inputRef.current?.blur();
  };

  const chromeClass =
    chrome === 'floating-panel' ? 'os-floating-panel-search' : 'sheet-control';

  return (
    <div
      className={`search-field${branded ? ' search-field--branded' : ''} ${chromeClass}${className ? ` ${className}` : ''}`}
    >
      {showDismiss ? (
        <button
          type="button"
          className="search-field-clear"
          onMouseDown={handleDismissMouseDown}
          onClick={handleDismiss}
          aria-label={dismissAriaLabel}
        >
          <ChevronDownIcon className="search-field-clear-icon" aria-hidden />
        </button>
      ) : null}
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
          onFocus={handleFocus}
          onBlur={handleBlur}
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
