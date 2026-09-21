'use client';

import type { ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { PortfolioGlassHost } from '@/components/overlay/portfolio-glass-host';
import {
  PortfolioPanelContinue,
  PortfolioShelfHopFrame,
} from '@/components/portfolio/portfolio-panel-continue';
import { PortfolioProfileSeedProvider } from '@/contexts/portfolio-profile-seed-context';
import { WritingComposeProvider } from '@/contexts/writing-compose-context';
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
      <WritingComposeProvider>
        <PortfolioShelfHopFrame>{children}</PortfolioShelfHopFrame>
        <PortfolioPanelContinue accountId={accountId} />
        {feedInlineRedirect ? (
          overlay
        ) : (
          <PortfolioGlassHost
            accountId={accountId}
            overlay={overlay}
            overlaySlotMode={overlaySlotMode}
          />
        )}
      </WritingComposeProvider>
    </PortfolioProfileSeedProvider>
  );
}
