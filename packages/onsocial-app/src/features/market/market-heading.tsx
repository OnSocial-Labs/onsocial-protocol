'use client';

import { ShopFillIcon } from '@onsocial/ui';
import { OsAppChromeNavSearch } from '@/components/app/os-app-chrome-nav-search';

interface MarketSearchHeadingProps {
  listingQuery?: string;
  onListingQueryChange?: (value: string) => void;
  onFocus?: () => void;
  onBlur?: () => void;
  /** When false, search ignores input (loading shell). */
  interactive?: boolean;
  searchPlaceholder?: string;
  searchAriaLabel?: string;
}

/** Search field only — same heading slot as Hubs. */
export function MarketSearchHeading({
  listingQuery = '',
  onListingQueryChange,
  onFocus,
  onBlur,
  interactive = true,
  searchPlaceholder = 'Search listings',
  searchAriaLabel = 'Search Market listings',
}: MarketSearchHeadingProps) {
  return (
    <OsAppChromeNavSearch
      value={listingQuery}
      onValueChange={
        interactive && onListingQueryChange
          ? onListingQueryChange
          : () => undefined
      }
      onFocus={onFocus}
      onBlur={onBlur}
      placeholder={searchPlaceholder}
      clearAriaLabel="Clear search"
      ariaLabel={searchAriaLabel}
      idleClassName="discover-nav-search-field"
      leadingIcon={<ShopFillIcon className="search-field-icon" aria-hidden />}
    />
  );
}
