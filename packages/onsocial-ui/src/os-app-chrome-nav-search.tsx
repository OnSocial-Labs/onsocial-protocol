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
import { OsIconAction } from './os-icon-action.js';
import { ChevronLeftIcon, MultiplyIcon } from './mage-stroke-icons.js';
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
 * Compact nav-row search — idle pill in the header; on mobile focus expands to
 * chevron-left + full-width field (Messages / Discover / Market pattern).
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
  /** Extra classes on idle SearchField (e.g. discover-nav-search-field). */
  idleClassName?: string;
  onActiveChange?: (active: boolean) => void;
  onFocus?: FocusEventHandler<HTMLInputElement>;
  onBlur?: FocusEventHandler<HTMLInputElement>;
}) {
  const isMobile = useMobileViewport();
  const [searchActive, setSearchActive] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const wasActiveRef = useRef(false);

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

  const handleIdleFocus = useCallback<FocusEventHandler<HTMLInputElement>>(
    (event) => {
      if (isMobile) setActive(true);
      onFocus?.(event);
    },
    [isMobile, onFocus]
  );

  useEffect(() => {
    if (!isMobile && searchActive) {
      setActive(false);
    }
  }, [isMobile, searchActive, setActive]);

  useEffect(() => {
    if (searchActive && isMobile && !wasActiveRef.current) {
      inputRef.current?.focus();
    }
    wasActiveRef.current = searchActive && isMobile;
  }, [isMobile, searchActive]);

  const showClear = value.trim().length > 0;

  if (isMobile && searchActive) {
    return (
      <div className={osAppChromeNavSearchClassName}>
        <OsIconAction ariaLabel="Close search" onClick={dismissSearch}>
          <ChevronLeftIcon className="glass-sheet-close-icon" aria-hidden />
        </OsIconAction>
        <input
          ref={inputRef}
          type="text"
          inputMode="search"
          enterKeyHint="search"
          value={value}
          onChange={(event) => onValueChange(event.target.value)}
          placeholder=""
          maxLength={maxLength}
          aria-label={ariaLabel ?? placeholder}
          className="os-app-chrome-nav-search-input"
          onBlur={onBlur}
        />
        {showClear ? (
          <OsIconAction
            ariaLabel={clearAriaLabel}
            onClick={() => onValueChange('')}
          >
            <MultiplyIcon className="glass-sheet-close-icon" aria-hidden />
          </OsIconAction>
        ) : null}
      </div>
    );
  }

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
        onFocus={handleIdleFocus}
        onBlur={onBlur}
      />
    </div>
  );
}
