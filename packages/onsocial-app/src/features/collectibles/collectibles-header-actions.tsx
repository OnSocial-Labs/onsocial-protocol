'use client';

import Link from 'next/link';
import {
  OsIconAction,
  osIconActionGlyphClassName,
  ShopFillIcon,
} from '@onsocial/ui';
import { useAppWallet } from '@/contexts/app-wallet-context';
import { accountIdsEqual } from '@/lib/account-match';
import { APP_DROP_CREATE_PATH, APP_MARKET_PATH } from '@/lib/app-routes';
import { OsRowAction } from '@/lib/os-row-action';

/** Market utility + owner New drop (`os-header-commit`). */
export function CollectiblesHeaderActions({
  pageAccountId = null,
}: {
  pageAccountId?: string | null;
}) {
  const { accountId, isConnected } = useAppWallet();
  const owner = pageAccountId?.trim() || null;
  const viewer = accountId?.trim() || null;
  const isSelf =
    Boolean(owner && viewer && isConnected && accountIdsEqual(viewer, owner));

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
        <OsRowAction className="os-header-commit" href={APP_DROP_CREATE_PATH}>
          New drop
        </OsRowAction>
      ) : null}
    </>
  );
}
