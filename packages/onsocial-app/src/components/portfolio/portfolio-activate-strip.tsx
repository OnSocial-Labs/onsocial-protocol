'use client';

import { useAppAccountSheet } from '@/contexts/app-account-sheet-context';
import { useAppWallet } from '@/contexts/app-wallet-context';
import { accountIdsEqual } from '@/lib/account-match';

interface PortfolioActivateStripProps {
  pageAccountId: string;
  activated: boolean;
}

/**
 * Empty owner face. Saving a profile name claims the page.
 * Visitors see the account id and no prompt.
 */
export function PortfolioActivateStrip({
  pageAccountId,
  activated,
}: PortfolioActivateStripProps) {
  const { accountId, isConnected } = useAppWallet();
  const { openProfileEditor } = useAppAccountSheet();

  if (activated) return null;

  const isOwner =
    isConnected &&
    Boolean(accountId) &&
    accountIdsEqual(accountId!, pageAccountId);

  if (!isOwner) return null;

  return (
    <p className="portfolio-activate-strip-hint">
      <button
        type="button"
        className="portfolio-activate-strip-edit"
        onClick={() => openProfileEditor({ pageAccountId })}
      >
        Edit profile
      </button>
    </p>
  );
}
