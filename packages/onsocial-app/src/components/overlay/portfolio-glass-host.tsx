'use client';

import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { usePathname, useSelectedLayoutSegments } from 'next/navigation';
import { OverlayGlassHeader } from '@/components/overlay/overlay-glass-header';
import {
  OverlayChromeProvider,
  useOverlayChrome,
  useOverlayChromeClear,
} from '@/contexts/overlay-chrome-context';
import { OverlayDismissProvider } from '@/contexts/overlay-dismiss-context';
import { useScrollLock } from '@/hooks/use-scroll-lock';
import { parseOverlayPanelKey } from '@/lib/overlay-routes';
import type { OverlaySlotMode } from '@/lib/overlay-slot';
import { shouldMountPortfolioGlassHost } from '@/lib/portfolio-glass-host';
import { GlassSheet } from '@onsocial/ui';

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
  presentation: 'enter' | 'swap';
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
    <OverlayDismissProvider accountId={accountId}>
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
  children,
}: {
  sheetOpen: boolean;
  overlayPresent: boolean;
  requestDismiss: () => void;
  onClosed: () => void;
  presentation: 'enter' | 'swap';
  scrollBodyRef?: React.RefObject<HTMLDivElement | null>;
  panelKey: string | null;
  children: ReactNode;
}) {
  useEffect(() => {
    if (!overlayPresent && sheetOpen) {
      requestDismiss();
    }
  }, [overlayPresent, requestDismiss, sheetOpen]);

  useScrollLock(sheetOpen);

  return (
    <GlassSheet
      open={sheetOpen}
      onClose={requestDismiss}
      onClosed={onClosed}
      presentation={presentation}
      initialDetent="full"
      tone="os"
      zIndex={50}
      ariaLabelledBy="overlay-title"
      backdropLabel="Close panel"
      bodyRef={scrollBodyRef}
      header={<OverlayGlassHeader panelKey={panelKey} />}
    >
      <div key={panelKey ?? 'overlay'} className="overlay-panel-outlet">
        {children}
      </div>
    </GlassSheet>
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
  const pathname = usePathname();
  const layoutSegments = useSelectedLayoutSegments();
  const panelKey = parseOverlayPanelKey(pathname);
  const overlayPresent = shouldMountPortfolioGlassHost({
    pathname,
    layoutSegments,
    overlaySlotMode,
  });
  const [hostMounted, setHostMounted] = useState(false);
  const [presentation, setPresentation] = useState<'enter' | 'swap'>('enter');
  const [trackedPanelKey, setTrackedPanelKey] = useState<string | null>(null);

  if (overlayPresent && !hostMounted) {
    setHostMounted(true);
  }

  if (!overlayPresent && hostMounted) {
    setHostMounted(false);
    setTrackedPanelKey(null);
    setPresentation('enter');
  }

  if (overlayPresent && panelKey && panelKey !== trackedPanelKey) {
    setPresentation(trackedPanelKey != null ? 'swap' : 'enter');
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
        presentation={presentation}
      >
        {overlayPresent ? overlay : null}
      </PortfolioGlassSheet>
    </OverlayChromeProvider>
  );
}
