'use client';

import { SectionHeader } from '@/components/layout/section-header';
import { usePageNavBadge } from '@/hooks/use-page-nav-badge';

export function GovernancePageIntro() {
  usePageNavBadge('Governance', 'blue');

  return (
    <SectionHeader
      title="Governance"
      description="Public proposals and on-chain decisions."
      size="compact"
      badgeAccent="blue"
      className="mb-4 hidden md:flex"
      contentClassName="flex-1"
    />
  );
}
