'use client';

import Link from 'next/link';
import {
  GiftFillIcon,
  OsIconAction,
  ShopFillIcon,
} from '@onsocial/ui';
import { OsAppChromeNavSearch } from '@/components/app/os-app-chrome-nav-search';
import { APP_MARKET_PATH } from '@/lib/app-routes';

interface DropsSearchHeadingProps {
  query?: string;
  onQueryChange?: (value: string) => void;
  interactive?: boolean;
}

/** Search field — replaces Drops title (same slot as Market / Hubs). */
export function DropsSearchHeading({
  query = '',
  onQueryChange,
  interactive = true,
}: DropsSearchHeadingProps) {
  return (
    <OsAppChromeNavSearch
      value={query}
      onValueChange={
        interactive && onQueryChange ? onQueryChange : () => undefined
      }
      placeholder="Search drops"
      clearAriaLabel="Clear search"
      ariaLabel="Search drops"
      idleClassName="discover-nav-search-field"
      leadingIcon={<GiftFillIcon className="search-field-icon" aria-hidden />}
    />
  );
}

/** Market cross-link — mirrors Market header → Drops. Create lives in the dock. */
export function DropsHeadingActions() {
  return (
    <OsIconAction asChild ariaLabel="Browse Market" title="Secondary listings">
      <Link href={APP_MARKET_PATH} scroll={false}>
        <ShopFillIcon aria-hidden className="glass-sheet-close-icon" />
      </Link>
    </OsIconAction>
  );
}

export function DropsLoadingActions() {
  return (
    <OsIconAction asChild ariaLabel="Browse Market" title="Secondary listings">
      <Link href={APP_MARKET_PATH} scroll={false}>
        <ShopFillIcon aria-hidden className="glass-sheet-close-icon" />
      </Link>
    </OsIconAction>
  );
}
