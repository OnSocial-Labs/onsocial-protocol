'use client';

import { useAppWallet } from '@/contexts/app-wallet-context';
import { accountIdsEqual } from '@/lib/account-match';
import { useActivatePage } from '@/hooks/use-activate-page';

interface PortfolioActivateStripProps {
  pageAccountId: string;
  activated: boolean;
}

export function PortfolioActivateStrip({
  pageAccountId,
  activated,
}: PortfolioActivateStripProps) {
  const { accountId, isConnected, isLoading, connect } = useAppWallet();
  const { activate, error, isActivating } = useActivatePage(pageAccountId);

  if (activated) {
    return null;
  }

  const isOwner =
    isConnected && Boolean(accountId) && accountIdsEqual(accountId!, pageAccountId);

  if (!isLoading && !isConnected) {
    return (
      <div className="portfolio-activate-strip">
        <p className="portfolio-activate-strip-copy">Dormant page</p>
        <button
          type="button"
          className="portfolio-activate-strip-cta"
          onClick={connect}
        >
          Connect to activate
        </button>
      </div>
    );
  }

  if (!isLoading && isConnected && !isOwner) {
    return (
      <p className="portfolio-activate-strip-hint">
        Connect as @{pageAccountId} to activate.
      </p>
    );
  }

  if (!isOwner) {
    return null;
  }

  return (
    <div className="portfolio-activate-strip">
      <p className="portfolio-activate-strip-copy">Claim this page on-chain</p>
      <button
        type="button"
        className="portfolio-activate-strip-cta"
        disabled={isActivating}
        onClick={() => void activate()}
      >
        {isActivating ? 'Activating…' : 'Activate'}
      </button>
      {error ? <p className="portfolio-activate-strip-error">{error}</p> : null}
    </div>
  );
}
