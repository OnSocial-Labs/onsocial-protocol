'use client';

import Link from 'next/link';
import {
  OsIconAction,
  osIconActionGlyphClassName,
  PlusIcon,
  ShopFillIcon,
} from '@onsocial/ui';
import { useAppWallet } from '@/contexts/app-wallet-context';
import { accountIdsEqual } from '@/lib/account-match';
import { APP_DROP_CREATE_PATH, APP_MARKET_PATH } from '@/lib/app-routes';

/** Market + create — same header cluster as Reputation's chart. */
export function CollectiblesHeaderActions({
  pageAccountId = null,
}: {
  pageAccountId?: string | null;
}) {
  const { accountId, isConnected } = useAppWallet();
  const isSelf =
    Boolean(pageAccountId) &&
    isConnected &&
    accountIdsEqual(accountId, pageAccountId);

  return (
    <>
      <OsIconAction asChild ariaLabel="Browse Market">
        <Link href={APP_MARKET_PATH} scroll={false}>
          <ShopFillIcon
            aria-hidden
            className={`${osIconActionGlyphClassName} glass-sheet-close-icon`}
          />
        </Link>
      </OsIconAction>
      {isSelf ? (
        <OsIconAction asChild ariaLabel="Start a drop">
          <Link href={APP_DROP_CREATE_PATH} scroll={false}>
            <PlusIcon
              aria-hidden
              className={`${osIconActionGlyphClassName} glass-sheet-close-icon`}
            />
          </Link>
        </OsIconAction>
      ) : null}
    </>
  );
}
