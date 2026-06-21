'use client';

import { SectionHeader } from '@/components/layout/section-header';
import { usePageNavBadge } from '@/hooks/use-page-nav-badge';

export function TransparencyPageIntro() {
  usePageNavBadge('Transparency', 'blue');

  return (
    <SectionHeader
      title="Transparency"
      description="On-chain supply, allocation, and token contract."
      size="compact"
      badgeAccent="blue"
      className="mb-0"
      contentClassName="flex-1"
    />
  );
}
