'use client';

import { useRef } from 'react';
import { OverlayPanelChrome } from '@/components/overlay/overlay-panel-chrome';
import {
  StandingPanelProvider,
  type StandingPanelProviderProps,
} from '@/components/panels/standing-panel-context';
import { StandingPanelContent } from '@/components/panels/standing-panel-content';
import { StandingSheetHeader } from '@/components/panels/standing-sheet-header';

type StandingSheetProps = Omit<StandingPanelProviderProps, 'children'>;

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

/** @deprecated Use StandingOverlaySheet with fixed toolbar chrome. */
export function StandingPanel(props: StandingSheetProps) {
  return (
    <StandingPanelProvider {...props}>
      <StandingPanelContent />
    </StandingPanelProvider>
  );
}
