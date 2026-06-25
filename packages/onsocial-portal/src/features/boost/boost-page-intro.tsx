'use client';

import Link from 'next/link';
import { SectionHeader } from '@/components/layout/section-header';
import { ProtocolMotionArrow } from '@onsocial/ui';
import { usePageNavBadge } from '@/hooks/use-page-nav-badge';

export function BoostPageIntro() {
  usePageNavBadge('Boost', 'blue');

  return (
    <SectionHeader
      title="Boost"
      description="Lock SOCIAL to grow influence on the network."
      size="compact"
      badgeAccent="blue"
      className="mb-0"
      contentClassName="flex-1"
      aside={
        <Link
          href="/boost/leaderboard"
          className="group inline-flex items-center gap-1 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          View leaderboard
          <ProtocolMotionArrow className="h-3 w-3" />
        </Link>
      }
    />
  );
}
