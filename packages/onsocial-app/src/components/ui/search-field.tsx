'use client';

import { useCallback, useRef } from 'react';
import { MultiplyIcon, SearchIcon } from '@onsocial/ui';

interface SearchFieldProps {
  value: string;
  onValueChange: (value: string) => void;
  placeholder?: string;
  maxLength?: number;
  clearAriaLabel?: string;
  ariaLabel?: string;
  className?: string;
}

export function SearchField({
  value,
  onValueChange,
  placeholder = 'Search',
  maxLength = 80,
  clearAriaLabel = 'Clear search',
  ariaLabel,
  className = '',
}: SearchFieldProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  const handleClear = useCallback(() => {
    onValueChange('');
    inputRef.current?.focus();
  }, [onValueChange]);

  return (
    <label
      className={`search-field sheet-control${className ? ` ${className}` : ''}`}
    >
      <SearchIcon className="search-field-icon" aria-hidden />
      <input
        ref={inputRef}
        type="text"
        inputMode="search"
        enterKeyHint="search"
        value={value}
        onChange={(event) => onValueChange(event.target.value)}
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
