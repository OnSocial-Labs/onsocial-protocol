'use client';

import { SectionHeader } from '@/components/layout/section-header';
import { Button } from '@/components/ui/button';
import { ProtocolMotionArrow } from '@onsocial/ui';
import { OpenBoostInAppLink } from '@/features/boost/open-boost-in-app';
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
          <OpenBoostInAppLink className="group inline-flex items-center gap-1">
            Open in OnSocial
            <ProtocolMotionArrow className="h-4 w-4" />
          </OpenBoostInAppLink>
        </Button>
      }
    />
  );
}
