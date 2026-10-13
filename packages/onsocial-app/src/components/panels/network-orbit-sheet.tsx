'use client';

import { useCallback, useRef, type RefObject } from 'react';
import { useRouter } from 'next/navigation';
import { OsAppScreen } from '@/components/app/os-app-screen';
import { OverlayPanelChrome } from '@/components/overlay/overlay-panel-chrome';
import { useOsInAppPop } from '@/components/providers/os-face-leave-provider';
import { NetworkOrbitContent } from '@/components/panels/network-orbit-content';
import {
  NetworkOrbitProvider,
  useNetworkOrbit,
  type NetworkOrbitProviderProps,
} from '@/components/panels/network-orbit-context';
import {
  NetworkCenterStandAction,
  NetworkOrbitSheetHeader,
  NetworkOrbitToolbar,
} from '@/components/panels/network-orbit-sheet-header';
import { portfolioPath } from '@/lib/overlay-routes';
import { networkMapTitle } from '@/components/panels/network-loading-title';

type NetworkOrbitSheetProps = Omit<NetworkOrbitProviderProps, 'children'>;

/** Glass overlay — soft nav from the face or the standing sheet. */
export function NetworkOrbitOverlaySheet(props: NetworkOrbitSheetProps) {
  const scrollRootRef = useRef<HTMLDivElement>(null);

  return (
    <NetworkOrbitProvider {...props}>
      <OverlayPanelChrome
        ariaTitle="Network"
        toolbar={<NetworkOrbitSheetHeader />}
        scrollBodyRef={scrollRootRef}
      />
      <NetworkOrbitContent />
    </NetworkOrbitProvider>
  );
}

function NetworkOrbitPageScreen({
  scrollRootRef,
  backFallbackHref,
}: {
  scrollRootRef: RefObject<HTMLElement | null>;
  backFallbackHref: string;
}) {
  const router = useRouter();
  const popInApp = useOsInAppPop();
  const { displayName, isSelf } = useNetworkOrbit();
  const onDockBack = useCallback(() => {
    const prior = window.history.state as { networkOrbit?: string } | null;
    // Face taps are their own history. The screen that opened the map is Next's.
    if (prior?.networkOrbit) {
      window.history.back();
      return;
    }
    if (popInApp()) return;
    router.push(backFallbackHref);
  }, [backFallbackHref, popInApp, router]);

  return (
    <OsAppScreen
      title={networkMapTitle(displayName)}
      className="network-orbit-screen"
      compactChrome
      glassChrome
      scrollRootRef={scrollRootRef}
      dockBack
      onDockBack={onDockBack}
      backFallbackHref={backFallbackHref}
      actions={isSelf ? undefined : <NetworkCenterStandAction />}
      toolbar={<NetworkOrbitToolbar />}
    >
      <NetworkOrbitContent />
    </OsAppScreen>
  );
}

/** Full-page network map (hard refresh / shared link) — same orbit, no sheet. */
export function NetworkOrbitPagePanel(props: NetworkOrbitSheetProps) {
  const scrollRootRef = useRef<HTMLElement>(null);

  return (
    <NetworkOrbitProvider {...props}>
      <NetworkOrbitPageScreen
        scrollRootRef={scrollRootRef}
        backFallbackHref={portfolioPath(props.accountId)}
      />
    </NetworkOrbitProvider>
  );
}
