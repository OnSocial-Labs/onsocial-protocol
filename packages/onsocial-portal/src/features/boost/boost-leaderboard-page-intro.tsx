'use client';

import Link from 'next/link';
import { SectionHeader } from '@/components/layout/section-header';
import { Button } from '@/components/ui/button';
import { ProtocolMotionArrow } from '@/components/ui/protocol-motion-arrow';
import { usePageNavBadge } from '@/hooks/use-page-nav-badge';

export function BoostLeaderboardPageIntro() {
  usePageNavBadge('Leaderboard', 'blue');

  return (
    <SectionHeader
      title="Leaderboard"
      description="Reputation multiplies posts, reactions, locks, and participation."
      size="compact"
      badgeAccent="blue"
      className="mb-4 hidden md:flex"
      contentClassName="flex-1"
      aside={
        <Button variant="outline" size="sm" asChild>
          <Link href="/boost" className="group">
            <ProtocolMotionArrow direction="left" className="h-4 w-4" />
            Back to Boost
          </Link>
        </Button>
      }
    />
  );
}
