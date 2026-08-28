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
import { parseOverlayPanelKey } from '@/lib/overlay-routes';
import type { OverlaySlotMode } from '@/lib/overlay-slot';
import { shouldMountPortfolioGlassHost } from '@/lib/portfolio-glass-host';
import { SHEET_Z } from '@/lib/sheet-z';
import { useLivePortfolioMoodVars } from '@/hooks/use-portfolio-mood-vars';
import { PostRowSkeleton } from '@/features/home/post-card';
import {
  OsPageSheet,
  type GlassSheetPresentation,
} from '@onsocial/ui';

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
    if (!overlayPresent && sheetOpen) {
      requestDismiss();
    }
  }, [overlayPresent, requestDismiss, sheetOpen]);

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
  const pathname = usePathname();
  const layoutSegments = useSelectedLayoutSegments();
  const panelKey = parseOverlayPanelKey(pathname);
  const overlayPresent = shouldMountPortfolioGlassHost({
    pathname,
    layoutSegments,
    overlaySlotMode,
  });
  const [hostMounted, setHostMounted] = useState(false);
  const [presentation, setPresentation] = useState<'appear' | 'swap'>('appear');
  const [trackedPanelKey, setTrackedPanelKey] = useState<string | null>(null);

  if (overlayPresent && !hostMounted) {
    setHostMounted(true);
  }

  if (!overlayPresent && hostMounted) {
    setHostMounted(false);
    setTrackedPanelKey(null);
    setPresentation('appear');
  }

  if (overlayPresent && panelKey && panelKey !== trackedPanelKey) {
    setPresentation(trackedPanelKey != null ? 'swap' : 'appear');
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
