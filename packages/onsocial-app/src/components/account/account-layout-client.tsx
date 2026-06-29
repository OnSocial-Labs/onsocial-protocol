'use client';

import type { ReactNode } from 'react';
import { PortfolioGlassHost } from '@/components/overlay/portfolio-glass-host';
import { PortfolioProfileSeedProvider } from '@/contexts/portfolio-profile-seed-context';
import { resolveOverlaySlotMode } from '@/lib/portfolio-glass-host';

export function AccountLayoutClient({
  accountId,
  children,
  overlay,
}: {
  accountId: string;
  children: ReactNode;
  overlay: ReactNode;
}) {
  const overlaySlotMode = resolveOverlaySlotMode(overlay);

  return (
    <PortfolioProfileSeedProvider>
      {children}
      <PortfolioGlassHost
        accountId={accountId}
        overlay={overlay}
        overlaySlotMode={overlaySlotMode}
      />
    </PortfolioProfileSeedProvider>
  );
}
