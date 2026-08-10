'use client';

import Link from 'next/link';
import {
  BookmarkFillIcon,
  GiftFillIcon,
  SearchField,
  ShopFillIcon,
  osIconActionClassName,
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
      <Link
        href={APP_DROPS_PATH}
        scroll={false}
        className={osIconActionClassName}
        aria-label="Browse drops"
        title="Primary edition Drops"
      >
        <GiftFillIcon aria-hidden className="glass-sheet-close-icon" />
      </Link>
      {viewerAccountId ? (
        <Link
          href={dropsPath({ sort: 'saved' })}
          scroll={false}
          className={osIconActionClassName}
          aria-label="Saved drops"
          title="Bookmarked drops"
        >
          <BookmarkFillIcon aria-hidden className="glass-sheet-close-icon" />
        </Link>
      ) : null}
    </>
  );
}

/** Loading shell actions — Drops only (no wallet required). */
export function MarketLoadingActions() {
  return (
    <Link
      href={APP_DROPS_PATH}
      scroll={false}
      className={osIconActionClassName}
      aria-label="Browse drops"
      title="Primary edition Drops"
    >
      <GiftFillIcon aria-hidden className="glass-sheet-close-icon" />
    </Link>
  );
}
