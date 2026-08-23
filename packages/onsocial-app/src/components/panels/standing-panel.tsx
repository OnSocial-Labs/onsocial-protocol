'use client';

import { useRef } from 'react';
import { OverlayPanelChrome } from '@/components/overlay/overlay-panel-chrome';
import {
  StandingPanelProvider,
  type StandingPanelProviderProps,
} from '@/components/panels/standing-panel-context';
import { StandingPanelContent } from '@/components/panels/standing-panel-content';
import { StandingListToolbar } from '@/components/panels/standing-list-toolbar';
import { StandingSheetHeader } from '@/components/panels/standing-sheet-header';

type StandingSheetProps = Omit<StandingPanelProviderProps, 'children'>;

/** Full-page standing (hard refresh / shared link) — kind toolbar + list, no sheet chrome. */
export function StandingPagePanel(props: StandingSheetProps) {
  return (
    <StandingPanelProvider {...props}>
      <StandingListToolbar />
      <StandingPanelContent />
    </StandingPanelProvider>
  );
}

export function StandingOverlaySheet(props: StandingSheetProps) {
  const scrollRootRef = useRef<HTMLDivElement>(null);

  return (
    <StandingPanelProvider
      {...props}
      shellVariant="overlay"
      scrollRootRef={scrollRootRef}
    >
      <OverlayPanelChrome
        ariaTitle="Standing"
        toolbar={<StandingSheetHeader />}
        scrollBodyRef={scrollRootRef}
      />
      <StandingPanelContent />
    </StandingPanelProvider>
  );
}
