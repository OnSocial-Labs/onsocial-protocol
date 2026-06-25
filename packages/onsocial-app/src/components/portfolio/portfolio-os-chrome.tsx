'use client';

import { PortfolioChrome } from '@/components/portfolio/portfolio-chrome';
import { PortfolioCustomize } from '@/components/portfolio/portfolio-customize';
import type { PublicPageConfig } from '@/lib/page-data';

interface PortfolioOsChromeProps {
  pageAccountId: string;
  config: PublicPageConfig;
}

export function PortfolioOsChrome({
  pageAccountId,
  config,
}: PortfolioOsChromeProps) {
  return (
    <>
      <PortfolioCustomize pageAccountId={pageAccountId} config={config} />
      <PortfolioChrome pageAccountId={pageAccountId} />
    </>
  );
}
