'use client';

import Link from 'next/link';
import {
  GiftFillIcon,
  OsIconAction,
  PlusIcon,
  SearchField,
  ShopFillIcon,
} from '@onsocial/ui';
import { useAppWallet } from '@/contexts/app-wallet-context';
import {
  APP_DROP_CREATE_PATH,
  APP_MARKET_PATH,
} from '@/lib/app-routes';

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
    <SearchField
      value={query}
      onValueChange={
        interactive && onQueryChange ? onQueryChange : () => undefined
      }
      placeholder="Search drops"
      clearAriaLabel="Clear search"
      ariaLabel="Search drops"
      className="discover-nav-search-field os-app-screen-search"
      leadingIcon={<GiftFillIcon className="search-field-icon" aria-hidden />}
    />
  );
}

/** Market + Create — same actions slot / glyph size as other screens. */
export function DropsHeadingActions() {
  const { accountId } = useAppWallet();
  const viewerAccountId = accountId?.trim() || null;

  return (
    <>
      <OsIconAction asChild ariaLabel="Browse Market" title="Secondary listings">
        <Link href={APP_MARKET_PATH} scroll={false}>
          <ShopFillIcon aria-hidden className="glass-sheet-close-icon" />
        </Link>
      </OsIconAction>
      {viewerAccountId ? (
        <OsIconAction asChild ariaLabel="Start a drop">
          <Link href={APP_DROP_CREATE_PATH} scroll={false}>
            <PlusIcon aria-hidden className="glass-sheet-close-icon" />
          </Link>
        </OsIconAction>
      ) : null}
    </>
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
