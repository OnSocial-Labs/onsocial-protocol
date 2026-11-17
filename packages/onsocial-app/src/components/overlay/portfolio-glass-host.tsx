'use client';

import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import { usePathname, useSelectedLayoutSegments } from 'next/navigation';
import { OverlayGlassHeader } from '@/components/overlay/overlay-glass-header';
import { OverlayInterceptRoot } from '@/components/overlay/overlay-intercept-root';
import {
  OverlayChromeProvider,
  useOverlayChrome,
  useOverlayChromeClear,
} from '@/contexts/overlay-chrome-context';
import { OverlayDismissProvider } from '@/contexts/overlay-dismiss-context';
import { EndorsementsSheetOpening } from '@/components/panels/endorsements-sheet-opening';
import {
  standingSheetAlreadyCovered,
  getNetworkStandingHandoffPhase,
} from '@/components/panels/network-standing-handoff';
import { StandingSheetOpening } from '@/components/panels/standing-sheet-opening';
import { writingShelfAlreadyCovered } from '@/lib/portfolio-shelf-hop';
import {
  getBrowserPath,
  getBrowserPathServerSnapshot,
  subscribeBrowserPath,
} from '@/lib/browser-path';
import { parseOverlayPanelKey } from '@/lib/overlay-routes';
import {
  isOverlayInterceptSlot,
  type OverlaySlotMode,
} from '@/lib/overlay-slot';
import {
  portfolioPanelIsFullScreen,
  routeKeepsPortfolioGlassSheet,
  shouldKeepStandingGlassHost,
  shouldMountPortfolioGlassHost,
} from '@/lib/portfolio-glass-host';
import { SHEET_Z } from '@/lib/sheet-z';
import { useLivePortfolioMoodVars } from '@/hooks/use-portfolio-mood-vars';
import { PostRowSkeleton } from '@/features/home/post-card';
import { OsPageSheet, type GlassSheetPresentation } from '@onsocial/ui';

/**
 * Opening chrome until `@overlay` delivers a real OverlayInterceptRoot.
 * Soft nav often parks an opaque client reference in the slot (mode=
 * intercept) that never paints `.endorsements-panel` / `.standing-panel`
 * while the RSC flight hangs — cover that gap from the URL.
 */
function FacePeekOverlayCover({ panelKey }: { panelKey: string }) {
  if (panelKey === 'endorsements') {
    return (
      <OverlayInterceptRoot>
        <EndorsementsSheetOpening />
      </OverlayInterceptRoot>
    );
  }
  if (panelKey.startsWith('standing:')) {
    return (
      <OverlayInterceptRoot>
        <StandingSheetOpening />
      </OverlayInterceptRoot>
    );
  }
  return null;
}

function PortfolioGlassSheet({
  accountId,
  overlayPresent,
  panelKey,
  presentation,
  children,
}: {
  accountId: string;
  overlayPresent: boolean;
  panelKey: string | null;
  presentation: Extract<GlassSheetPresentation, 'appear' | 'swap'>;
  children: ReactNode;
}) {
  const chrome = useOverlayChrome();
  const clearChrome = useOverlayChromeClear();
  const prevPanelKeyRef = useRef<string | null>(null);
  const scrollCacheRef = useRef(new Map<string, number>());

  useEffect(() => {
    const prevKey = prevPanelKeyRef.current;
    if (
      prevKey &&
      panelKey &&
      prevKey !== panelKey &&
      chrome?.scrollBodyRef?.current
    ) {
      scrollCacheRef.current.set(
        prevKey,
        chrome.scrollBodyRef.current.scrollTop
      );
    }
    if (panelKey) {
      prevPanelKeyRef.current = panelKey;
    }
  }, [chrome?.scrollBodyRef, panelKey]);

  useLayoutEffect(() => {
    const scrollBody = chrome?.scrollBodyRef?.current;
    if (!panelKey || !scrollBody) {
      return;
    }
    const cached = scrollCacheRef.current.get(panelKey);
    if (cached != null) {
      // eslint-disable-next-line react-hooks/immutability -- restore scroll position on panel swap
      scrollBody.scrollTop = cached;
    }
  }, [chrome?.scrollBodyRef, panelKey]);

  return (
    <OverlayDismissProvider
      accountId={accountId}
      overlayPresent={overlayPresent}
    >
      {({ sheetOpen, requestDismiss, handleSheetClosed }) => (
        <PortfolioGlassSheetFrame
          sheetOpen={sheetOpen}
          overlayPresent={overlayPresent}
          requestDismiss={requestDismiss}
          onClosed={() => {
            clearChrome();
            prevPanelKeyRef.current = null;
            scrollCacheRef.current.clear();
            handleSheetClosed();
          }}
          presentation={presentation}
          scrollBodyRef={chrome?.scrollBodyRef}
          panelKey={panelKey}
          showFeedSkeleton={panelKey === 'feed' && chrome == null}
        >
          {children}
        </PortfolioGlassSheetFrame>
      )}
    </OverlayDismissProvider>
  );
}

function PortfolioGlassSheetFrame({
  sheetOpen,
  overlayPresent,
  requestDismiss,
  onClosed,
  presentation,
  scrollBodyRef,
  panelKey,
  showFeedSkeleton,
  children,
}: {
  sheetOpen: boolean;
  overlayPresent: boolean;
  requestDismiss: () => void;
  onClosed: () => void;
  presentation: Extract<GlassSheetPresentation, 'appear' | 'swap'>;
  scrollBodyRef?: React.RefObject<HTMLDivElement | null>;
  panelKey: string | null;
  showFeedSkeleton: boolean;
  children: ReactNode;
}) {
  const faceMood = useLivePortfolioMoodVars(overlayPresent);

  useEffect(() => {
    if (overlayPresent || !sheetOpen) return;
    if (portfolioPanelIsFullScreen(panelKey)) return;
    if (getNetworkStandingHandoffPhase() === 'open') return;
    // The slot can lag the router by a frame. Dismissing then closes the
    // sheet the person just opened. A full screen never reaches this effect:
    // the host unmounts it in the same render.
    if (routeKeepsPortfolioGlassSheet(window.location.pathname)) return;
    requestDismiss();
  }, [overlayPresent, panelKey, requestDismiss, sheetOpen]);

  return (
    <OsPageSheet
      open={sheetOpen}
      onClose={requestDismiss}
      onClosed={onClosed}
      // Feed sits on the page-drawer peek — opaque mood, not a second frost.
      surface={panelKey === 'feed' ? 'page' : 'glass'}
      presentation={presentation}
      zIndex={SHEET_Z.overlayHost}
      ariaLabelledBy="overlay-title"
      backdropLabel="Close panel"
      bodyRef={scrollBodyRef}
      keepDock={panelKey === 'about' || panelKey === 'writing'}
      panelClassName={
        panelKey === 'about'
          ? 'portfolio-about-sheet-panel'
          : panelKey === 'writing'
            ? 'portfolio-writing-sheet-panel'
            : undefined
      }
      header={<OverlayGlassHeader panelKey={panelKey} />}
      {...(faceMood.moodId ? { moodId: faceMood.moodId } : {})}
      {...(faceMood.style ? { moodStyle: faceMood.style } : {})}
    >
      <div key={panelKey ?? 'overlay'} className="overlay-panel-outlet">
        {children}
      </div>
      {showFeedSkeleton ? (
        <div className="panel-body">
          <PostRowSkeleton rows={4} />
        </div>
      ) : null}
    </OsPageSheet>
  );
}

export function PortfolioGlassHost({
  accountId,
  overlay,
  overlaySlotMode,
}: {
  accountId: string;
  overlay: ReactNode;
  overlaySlotMode: OverlaySlotMode;
}) {
  const routerPathname = usePathname();
  const browserPath = useSyncExternalStore(
    subscribeBrowserPath,
    getBrowserPath,
    getBrowserPathServerSnapshot
  );
  // Soft nav updates the address bar before usePathname / @overlay RSC settle.
  const pathname = browserPath || routerPathname;
  const layoutSegments = useSelectedLayoutSegments();
  const panelKey = parseOverlayPanelKey(pathname);
  const overlayPresent = shouldMountPortfolioGlassHost({
    pathname,
    layoutSegments,
    overlaySlotMode,
  });
  const facePeekCover =
    overlayPresent &&
    panelKey != null &&
    (panelKey === 'endorsements' || panelKey.startsWith('standing:')) &&
    !isOverlayInterceptSlot(overlay);
  const [hostMounted, setHostMounted] = useState(false);
  const [presentation, setPresentation] = useState<'appear' | 'swap'>(() =>
    standingSheetAlreadyCovered() || writingShelfAlreadyCovered()
      ? 'swap'
      : 'appear'
  );
  const [trackedPanelKey, setTrackedPanelKey] = useState<string | null>(null);
  const sheetPresentation =
    standingSheetAlreadyCovered() || writingShelfAlreadyCovered()
      ? 'swap'
      : presentation;

  if (overlayPresent && !hostMounted) {
    setHostMounted(true);
  }

  // The map (and the other full screens) replace the sheet. Drop it in this
  // render. Waiting on window.location left the frost up after the router
  // had already committed, and nothing rendered again to take it down.
  if (portfolioPanelIsFullScreen(panelKey)) {
    if (hostMounted || trackedPanelKey != null) {
      setHostMounted(false);
      setTrackedPanelKey(null);
      setPresentation('appear');
    }
    return null;
  }

  if (!overlayPresent && hostMounted) {
    const keepStandingSheet = shouldKeepStandingGlassHost({
      panelKey,
      handoffPhase: getNetworkStandingHandoffPhase(),
    });
    // Slot mode can lag the router by a frame. The router pathname is what
    // still names the sheet; the address bar is not.
    if (!keepStandingSheet && !routeKeepsPortfolioGlassSheet(pathname)) {
      setHostMounted(false);
      setTrackedPanelKey(null);
      setPresentation('appear');
    }
  }

  if (overlayPresent && panelKey && panelKey !== trackedPanelKey) {
    // A sheet that already covered the map stays put when the route finishes.
    setPresentation(
      standingSheetAlreadyCovered() ||
        writingShelfAlreadyCovered() ||
        trackedPanelKey != null
        ? 'swap'
        : 'appear'
    );
    setTrackedPanelKey(panelKey);
  }

  if (!overlayPresent && !hostMounted) {
    return null;
  }

  return (
    <OverlayChromeProvider>
      <PortfolioGlassSheet
        accountId={accountId}
        overlayPresent={overlayPresent}
        panelKey={panelKey}
        presentation={sheetPresentation}
      >
        {overlayPresent ? (
          facePeekCover && panelKey ? (
            <FacePeekOverlayCover panelKey={panelKey} />
          ) : (
            overlay
          )
        ) : null}
      </PortfolioGlassSheet>
    </OverlayChromeProvider>
  );
}
