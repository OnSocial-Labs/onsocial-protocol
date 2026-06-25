'use client';

import { AppWalletPill } from '@/components/wallet/app-wallet-pill';

interface PortfolioChromeProps {
  pageAccountId: string;
}

export function PortfolioChrome({ pageAccountId }: PortfolioChromeProps) {
  return (
    <div className="portfolio-wallet-corner">
      <AppWalletPill pageAccountId={pageAccountId} variant="corner" />
    </div>
  );
}
