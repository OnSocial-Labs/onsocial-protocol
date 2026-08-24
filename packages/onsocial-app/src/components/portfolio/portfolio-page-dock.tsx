'use client';

import { PortfolioSummonDock } from '@/components/portfolio/portfolio-summon-dock';

/** Fixed portfolio launcher — overlays face and page drawer. */
export function PortfolioPageDock({
  pageAccountId,
}: {
  pageAccountId: string;
}) {
  return <PortfolioSummonDock pageAccountId={pageAccountId} />;
}
