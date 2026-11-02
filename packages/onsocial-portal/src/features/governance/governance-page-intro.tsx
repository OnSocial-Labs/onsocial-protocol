'use client';

import { SectionHeader } from '@/components/layout/section-header';
import { usePortalNetwork } from '@/contexts/portal-network-context';
import { usePageNavBadge } from '@/hooks/use-page-nav-badge';

export function GovernancePageIntro() {
  const { live } = usePortalNetwork();
  usePageNavBadge('Governance', 'blue');

  return (
    // sr-only (not hidden) on mobile so the h1 stays in the accessibility tree;
    // the mobile navbar badge carries the visible page name there.
    <div className="max-md:sr-only">
      <SectionHeader
        title="Governance"
        titleAs="h1"
        description={
          live.governance
            ? 'Public proposals and on-chain decisions.'
            : 'Not live on this network yet.'
        }
        size="compact"
        badgeAccent="blue"
        className="mb-4"
        contentClassName="flex-1"
      />
    </div>
  );
}
