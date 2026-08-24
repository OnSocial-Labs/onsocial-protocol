'use client';

import type { ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { PortfolioGlassHost } from '@/components/overlay/portfolio-glass-host';
import { PortfolioProfileSeedProvider } from '@/contexts/portfolio-profile-seed-context';
import { parseOverlayPanelKey } from '@/lib/overlay-routes';
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
  const pathname = usePathname();
  const panelKey = parseOverlayPanelKey(pathname);
  const overlaySlotMode = resolveOverlaySlotMode(overlay);
  const feedInlineRedirect = panelKey === 'feed';

  return (
    <PortfolioProfileSeedProvider>
      {children}
      {feedInlineRedirect ? (
        overlay
      ) : (
        <PortfolioGlassHost
          accountId={accountId}
          overlay={overlay}
          overlaySlotMode={overlaySlotMode}
        />
      )}
    </PortfolioProfileSeedProvider>
  );
}
