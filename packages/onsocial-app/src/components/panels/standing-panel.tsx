'use client';

import { useRef, type RefObject } from 'react';
import { AppShellLauncher } from '@/components/os/summon-launcher';
import { OverlayPanelChrome } from '@/components/overlay/overlay-panel-chrome';
import {
  StandingPanelProvider,
  type StandingPanelProviderProps,
} from '@/components/panels/standing-panel-context';
import { StandingPanelContent } from '@/components/panels/standing-panel-content';
import { StandingSheetHeader } from '@/components/panels/standing-sheet-header';

type StandingSheetProps = Omit<StandingPanelProviderProps, 'children'>;

function StandingPageScreen({
  scrollRootRef,
}: {
  scrollRootRef: RefObject<HTMLElement | null>;
}) {
  return (
    <div className="os-app-screen standing-page-screen app-surface" data-tone="os">
      <div className="os-app-screen-column">
        <header className="os-app-screen-header standing-page-screen-header">
          <StandingSheetHeader />
        </header>
        <main ref={scrollRootRef} className="os-app-screen-body">
          <StandingPanelContent />
        </main>
      </div>
      <AppShellLauncher />
    </div>
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

export function StandingPageShell(props: StandingSheetProps) {
  const scrollRootRef = useRef<HTMLElement>(null);

  return (
    <StandingPanelProvider
      {...props}
      shellVariant="page"
      scrollRootRef={scrollRootRef}
    >
      <StandingPageScreen scrollRootRef={scrollRootRef} />
    </StandingPanelProvider>
  );
}

/** @deprecated Use StandingOverlaySheet or StandingPageShell with fixed toolbar chrome. */
export function StandingPanel(props: StandingSheetProps) {
  return (
    <StandingPanelProvider {...props}>
      <StandingPanelContent />
    </StandingPanelProvider>
  );
}
