'use client';

import { useRef } from 'react';
import { OsAppChromePage } from '@onsocial/ui';
import { OverlayPanelChrome } from '@/components/overlay/overlay-panel-chrome';
import { ProfileSocialListSkeleton } from '@/components/panels/profile-social-list-row';
import { DiscoverPanelRoot } from '@/features/discover/discover-panel';
import { DiscoverSheetHeader } from '@/features/discover/discover-sheet-header';

/**
 * Soft-open cold chrome while the Discover overlay RSC loads.
 * Same OsAppChromePage inset as settled DiscoverPanelContent — never a bare
 * `.discover-panel` (that class alone has no padding).
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
      <OsAppChromePage
        className="discover-panel"
        aria-busy="true"
        aria-live="polite"
      >
        <p className="sr-only">Loading Discover…</p>
        <ProfileSocialListSkeleton rowVariant="discover" />
      </OsAppChromePage>
    </DiscoverPanelRoot>
  );
}
