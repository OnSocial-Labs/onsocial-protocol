'use client';

import { PageShell } from '@/components/layout/page-shell';
import { SecondaryPageHeader } from '@/components/layout/secondary-page-header';
import { SocialSwapPanel } from '@/components/social-swap-panel';
import { SurfacePanel } from '@/components/ui/surface-panel';
import { PORTAL_SWAP_ENABLED } from '@/lib/portal-swap-config';

export default function SocialSwapPage() {
  return (
    <PageShell size="section">
      <SecondaryPageHeader
        badge="Token"
        badgeAccent="blue"
        glowAccents={['blue', 'green']}
        glowClassName="h-40 opacity-70"
        title={
          <>
            Get <span className="portal-green-text">$</span>SOCIAL
          </>
        }
        description={
          PORTAL_SWAP_ENABLED
            ? 'Bring NEAR or USDC — leave with SOCIAL on Rhea.'
            : 'Stock up on testnet via your faucet, or pick up SOCIAL on mainnet through Rhea.'
        }
      />

      <div className="mx-auto max-w-md">
        <SurfacePanel radius="xl" tone="soft" className="p-5">
          <SocialSwapPanel />
        </SurfacePanel>
      </div>
    </PageShell>
  );
}
