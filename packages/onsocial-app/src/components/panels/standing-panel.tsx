'use client';

import { useRef, type RefObject } from 'react';
import { AppShellLauncher } from '@/components/os/summon-launcher';
import { useViewerDockMood } from '@/hooks/use-viewer-dock-mood';
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
  const { moodId, style } = useViewerDockMood();
  const hasMood = Boolean(moodId);

  return (
    <div
      className={`os-app-screen standing-page-screen app-surface${
        hasMood ? ' os-app-screen--mood' : ''
      }`}
      data-tone="os"
      data-mood={hasMood ? moodId! : undefined}
      style={style}
    >
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
