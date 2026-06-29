'use client';

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { useOverlayClose } from '@/hooks/use-overlay-close';
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

interface OverlayDismissProviderProps {
  accountId: string;
  children: (props: {
    sheetOpen: boolean;
    requestDismiss: () => void;
    handleSheetClosed: () => void;
  }) => ReactNode;
}

export function OverlayDismissProvider({
  accountId,
  children,
}: OverlayDismissProviderProps) {
  const routerDismiss = useOverlayClose(accountId);
  const [sheetOpen, setSheetOpen] = useState(true);

  const requestDismiss = useCallback(() => {
    setSheetOpen(false);
  }, []);

  const handleSheetClosed = useCallback(() => {
    routerDismiss();
  }, [routerDismiss]);

  const value = useMemo(
    () => ({ requestDismiss }),
    [requestDismiss]
  );

  return (
    <OverlayDismissContext.Provider value={value}>
      {children({ sheetOpen, requestDismiss, handleSheetClosed })}
    </OverlayDismissContext.Provider>
  );
}

export type { GlassSheetDetent };
