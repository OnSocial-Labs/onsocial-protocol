'use client';

import { useCallback, useRef, type RefObject } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AlignJustifyIcon, OsIconAction } from '@onsocial/ui';
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
  NetworkOrbitSheetHeader,
  NetworkOrbitToolbar,
} from '@/components/panels/network-orbit-sheet-header';
import { portfolioPath } from '@/lib/overlay-routes';

type NetworkOrbitSheetProps = Omit<NetworkOrbitProviderProps, 'children'>;

function NetworkOrbitListAction() {
  const { listHref } = useNetworkOrbit();
  return (
    <OsIconAction asChild ariaLabel="Open standing list">
      <Link href={listHref} scroll={false} aria-label="Open standing list">
        <AlignJustifyIcon
          className="glass-sheet-icon-action-glyph"
          aria-hidden
        />
      </Link>
    </OsIconAction>
  );
}

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
    if (popInApp()) return;
    const prior = window.history.state as { networkOrbit?: string } | null;
    if (prior?.networkOrbit) {
      window.history.back();
      return;
    }
    router.push(backFallbackHref);
  }, [backFallbackHref, popInApp, router]);

  return (
    <OsAppScreen
      title={isSelf ? 'Your network' : `${displayName}'s network`}
      compactChrome
      glassChrome
      scrollRootRef={scrollRootRef}
      leading={null}
      dockBack
      onDockBack={onDockBack}
      backFallbackHref={backFallbackHref}
      actions={<NetworkOrbitListAction />}
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
