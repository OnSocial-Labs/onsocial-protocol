'use client';

import { useRef } from 'react';
import { OverlayPanelChrome } from '@/components/overlay/overlay-panel-chrome';
import { ProfileSocialListSkeleton } from '@/components/panels/profile-social-list-row';
import { DiscoverPanelRoot } from '@/features/discover/discover-panel';
import { DiscoverSheetHeader } from '@/features/discover/discover-sheet-header';

/**
 * Soft-open cold chrome while the Discover overlay RSC loads.
 * Header + profile skeleton match the settled overlay seat.
 */
export function DiscoverSheetOpening() {
  const scrollRootRef = useRef<HTMLDivElement>(null);
  return (
    <DiscoverPanelRoot shellVariant="overlay" scrollRootRef={scrollRootRef}>
      <OverlayPanelChrome
        ariaTitle="Discover"
        toolbar={<DiscoverSheetHeader />}
        scrollBodyRef={scrollRootRef}
      />
      <div className="discover-panel" aria-busy="true">
        <p className="sr-only">Loading Discover…</p>
        <ProfileSocialListSkeleton rowVariant="discover" />
      </div>
    </DiscoverPanelRoot>
  );
}
