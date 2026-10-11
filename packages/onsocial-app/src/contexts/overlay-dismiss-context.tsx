'use client';

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { usePathname, useSelectedLayoutSegments } from 'next/navigation';
import { accountIdFromPath, parseOverlayPanelKey } from '@/lib/overlay-routes';
import { armStandingCloseCover } from '@/components/panels/network-standing-handoff';
import {
  standingCloseLeavesToFace,
  standingCloseSkipsReveal,
  useOverlayClose,
} from '@/hooks/use-overlay-close';
import type { GlassSheetDetent } from '@onsocial/ui';

interface OverlayDismissContextValue {
  requestDismiss: () => void;
}

const OverlayDismissContext = createContext<OverlayDismissContextValue | null>(
  null
);

export function useOverlayDismiss(): () => void {
  const context = useContext(OverlayDismissContext);
  return context?.requestDismiss ?? (() => {});
}

/** Null outside the portfolio glass overlay — hard-refresh About is a real page. */
export function useOverlayDismissIfMounted(): (() => void) | null {
  return useContext(OverlayDismissContext)?.requestDismiss ?? null;
}

interface OverlayDismissProviderProps {
  accountId: string;
  /** Route still has a sheet. Coming back from the map must open it again. */
  overlayPresent: boolean;
  /** Early map cover closes back to the map instead of the route dismiss. */
  onRequestDismiss?: () => void;
  children: (props: {
    sheetOpen: boolean;
    requestDismiss: () => void;
    handleSheetClosed: () => void;
  }) => ReactNode;
}

export function OverlayDismissProvider({
  accountId,
  overlayPresent,
  onRequestDismiss,
  children,
}: OverlayDismissProviderProps) {
  const routerDismiss = useOverlayClose(accountId);
  const pathname = usePathname() ?? '';
  const layoutSegments = useSelectedLayoutSegments();
  const [sheetOpen, setSheetOpen] = useState(true);
  const [overlayWasPresent, setOverlayWasPresent] = useState(overlayPresent);
  if (overlayPresent !== overlayWasPresent) {
    setOverlayWasPresent(overlayPresent);
    if (overlayPresent && !sheetOpen) setSheetOpen(true);
  }

  const requestDismiss = useCallback(() => {
    if (onRequestDismiss) {
      onRequestDismiss();
      return;
    }
    const browserPath = window.location.pathname;
    if (
      parseOverlayPanelKey(browserPath) === 'network' ||
      parseOverlayPanelKey(pathname) === 'network'
    ) {
      setSheetOpen(false);
      return;
    }
    const path = standingCloseLeavesToFace(browserPath)
      ? browserPath
      : pathname;
    if (standingCloseSkipsReveal(path, layoutSegments)) {
      armStandingCloseCover(accountIdFromPath(path) ?? accountId);
      document.documentElement.dataset.standingHandoff = 'close';
      routerDismiss();
      return;
    }
    setSheetOpen(false);
  }, [accountId, layoutSegments, onRequestDismiss, pathname, routerDismiss]);

  const handleSheetClosed = useCallback(() => {
    routerDismiss();
  }, [routerDismiss]);

  const value = useMemo(() => ({ requestDismiss }), [requestDismiss]);

  return (
    <OverlayDismissContext.Provider value={value}>
      {children({ sheetOpen, requestDismiss, handleSheetClosed })}
    </OverlayDismissContext.Provider>
  );
}

export type { GlassSheetDetent };
