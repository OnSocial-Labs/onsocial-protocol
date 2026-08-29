'use client';

import {
  useCallback,
  useEffect,
  useRef,
  useSyncExternalStore,
  useState,
  type FocusEventHandler,
  type ReactNode,
} from 'react';
import { cn } from './cn.js';
import { Divider } from './divider.js';
import { OsIconAction } from './os-icon-action.js';
import {
  ChevronDownIcon,
  MultiplyIcon,
  SearchIcon,
} from './mage-stroke-icons.js';
import { SearchField } from './search-field.js';

export const osAppChromeNavSearchClassName = 'os-app-chrome-nav-search';
export const osAppChromeNavSearchIdleClassName = 'os-app-screen-search';

const MOBILE_MAX_WIDTH_PX = 767;

function subscribeMobile(onStoreChange: () => void) {
  const mq = window.matchMedia(`(max-width: ${MOBILE_MAX_WIDTH_PX}px)`);
  mq.addEventListener('change', onStoreChange);
  return () => mq.removeEventListener('change', onStoreChange);
}

function getMobileSnapshot() {
  return window.matchMedia(`(max-width: ${MOBILE_MAX_WIDTH_PX}px)`).matches;
}

function getServerMobileSnapshot() {
  return false;
}

function useMobileViewport() {
  return useSyncExternalStore(
    subscribeMobile,
    getMobileSnapshot,
    getServerMobileSnapshot
  );
}

/**
 * Compact nav-row search. Mobile: one stable shell (same box, padding, slots).
 * Focus only swaps leading mark→Done and fades the pill fill — the bar does
 * not remount or resize. Desktop stays SearchField.
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
  /** Extra classes (e.g. discover-nav-search-field). */
  idleClassName?: string;
  onActiveChange?: (active: boolean) => void;
  onFocus?: FocusEventHandler<HTMLInputElement>;
  onBlur?: FocusEventHandler<HTMLInputElement>;
}) {
  const isMobile = useMobileViewport();
  const [searchActive, setSearchActive] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const setActive = useCallback(
    (active: boolean) => {
      setSearchActive(active);
      onActiveChange?.(active);
    },
    [onActiveChange]
  );

  const dismissSearch = useCallback(() => {
    onValueChange('');
    setActive(false);
    inputRef.current?.blur();
  }, [onValueChange, setActive]);

  const handleFocus = useCallback<FocusEventHandler<HTMLInputElement>>(
    (event) => {
      setActive(true);
      onFocus?.(event);
    },
    [onFocus, setActive]
  );

  const handleBlur = useCallback<FocusEventHandler<HTMLInputElement>>(
    (event) => {
      setActive(false);
      onBlur?.(event);
    },
    [onBlur, setActive]
  );

  useEffect(() => {
    if (!isMobile && searchActive) {
      setActive(false);
    }
  }, [isMobile, searchActive, setActive]);

  const showClear = value.trim().length > 0;
  const branded = Boolean(leadingIcon);

  if (!isMobile) {
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
          onFocus={onFocus}
          onBlur={onBlur}
        />
      </div>
    );
  }

  return (
    <div
      data-sheet-initial-focus-skip=""
      data-search-active={searchActive ? 'true' : undefined}
      className={cn(
        osAppChromeNavSearchClassName,
        'search-field',
        'sheet-control',
        osAppChromeNavSearchIdleClassName,
        branded && 'search-field--branded',
        idleClassName
      )}
    >
      <div className="os-app-chrome-nav-search-leading">
        <span className="os-app-chrome-nav-search-glyph">
          {searchActive ? (
            <OsIconAction
              className="os-app-chrome-nav-search-done"
              ariaLabel="Done"
              onMouseDown={(event) => event.preventDefault()}
              onClick={dismissSearch}
            >
              <ChevronDownIcon
                className="os-app-chrome-nav-search-done-icon"
                aria-hidden
              />
            </OsIconAction>
          ) : (
            (leadingIcon ?? (
              <SearchIcon className="search-field-icon" aria-hidden />
            ))
          )}
        </span>
        {branded ? (
          <Divider
            orientation="vertical"
            variant="detail"
            className={cn(
              'search-field-divider',
              'self-center',
              searchActive && 'os-app-chrome-nav-search-divider-hide'
            )}
          />
        ) : null}
      </div>
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
        className="os-app-chrome-nav-search-input"
        onFocus={handleFocus}
        onBlur={handleBlur}
      />
      <div className="os-app-chrome-nav-search-trailing">
        {showClear ? (
          <OsIconAction
            ariaLabel={clearAriaLabel}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => {
              onValueChange('');
              inputRef.current?.focus();
            }}
          >
            <MultiplyIcon className="glass-sheet-close-icon" aria-hidden />
          </OsIconAction>
        ) : null}
      </div>
    </div>
  );
}
