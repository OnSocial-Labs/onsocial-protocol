'use client';

import { SectionHeader } from '@/components/layout/section-header';
import { Button } from '@/components/ui/button';
import { ProtocolMotionArrow } from '@onsocial/ui';
import { OpenBoostInAppLink } from '@/features/boost/open-boost-in-app';
import { usePageNavBadge } from '@/hooks/use-page-nav-badge';

export function BoostLeaderboardPageIntro() {
  usePageNavBadge('Leaderboard', 'blue');

  return (
    // sr-only (not hidden) on mobile so the h1 stays in the accessibility tree;
    // the mobile navbar badge carries the visible page name there. The aside
    // link stays display:none on mobile so it cannot be tab-focused invisibly.
    <div className="max-md:sr-only">
      <SectionHeader
        title="Leaderboard"
        titleAs="h1"
        description="Reputation multiplies posts, reactions, locks, and participation."
        size="compact"
        badgeAccent="blue"
        className="mb-4"
        contentClassName="flex-1"
        aside={
          <div className="max-md:hidden">
            <Button variant="outline" size="sm" asChild>
              <OpenBoostInAppLink className="group inline-flex items-center gap-1">
                Open in OnSocial
                <ProtocolMotionArrow className="h-4 w-4" />
              </OpenBoostInAppLink>
            </Button>
          </div>
        }
      />
    </div>
  );
}
