'use client';

import Link from 'next/link';
import {
  BookmarkFillIcon,
  GiftFillIcon,
  OsIconAction,
  SearchField,
  ShopFillIcon,
} from '@onsocial/ui';
import { useAppWallet } from '@/contexts/app-wallet-context';
import { APP_DROPS_PATH, dropsPath } from '@/lib/app-routes';

interface MarketSearchHeadingProps {
  listingQuery?: string;
  onListingQueryChange?: (value: string) => void;
  /** When false, search ignores input (loading shell). */
  interactive?: boolean;
}

/** Search field only — same heading slot as Hubs. */
export function MarketSearchHeading({
  listingQuery = '',
  onListingQueryChange,
  interactive = true,
}: MarketSearchHeadingProps) {
  return (
    <SearchField
      value={listingQuery}
      onValueChange={
        interactive && onListingQueryChange
          ? onListingQueryChange
          : () => undefined
      }
      placeholder="Search listings"
      clearAriaLabel="Clear search"
      ariaLabel="Search Market listings"
      className="discover-nav-search-field os-app-screen-search"
      leadingIcon={<ShopFillIcon className="search-field-icon" aria-hidden />}
    />
  );
}

/** Drops + Saved — same `actions` slot / icon style as Hubs +. */
export function MarketHeadingActions() {
  const { accountId } = useAppWallet();
  const viewerAccountId = accountId?.trim() || null;

  return (
    <>
      <OsIconAction asChild ariaLabel="Browse drops" title="Primary edition Drops">
        <Link href={APP_DROPS_PATH} scroll={false}>
          <GiftFillIcon aria-hidden className="glass-sheet-close-icon" />
        </Link>
      </OsIconAction>
      {viewerAccountId ? (
        <OsIconAction asChild ariaLabel="Saved drops" title="Bookmarked drops">
          <Link href={dropsPath({ sort: 'saved' })} scroll={false}>
            <BookmarkFillIcon aria-hidden className="glass-sheet-close-icon" />
          </Link>
        </OsIconAction>
      ) : null}
    </>
  );
}

/** Loading shell actions — Drops only (no wallet required). */
export function MarketLoadingActions() {
  return (
    <OsIconAction asChild ariaLabel="Browse drops" title="Primary edition Drops">
      <Link href={APP_DROPS_PATH} scroll={false}>
        <GiftFillIcon aria-hidden className="glass-sheet-close-icon" />
      </Link>
    </OsIconAction>
  );
}
