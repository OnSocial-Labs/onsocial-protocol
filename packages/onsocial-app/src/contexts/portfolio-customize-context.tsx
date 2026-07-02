'use client';

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  type ReactNode,
} from 'react';

interface PortfolioCustomizeContextValue {
  registerOpen: (open: () => void) => void;
  unregisterOpen: () => void;
  openCustomize: () => void;
}

const PortfolioCustomizeContext =
  createContext<PortfolioCustomizeContextValue | null>(null);

export function PortfolioCustomizeProvider({ children }: { children: ReactNode }) {
  const openRef = useRef<(() => void) | null>(null);

  const registerOpen = useCallback((open: () => void) => {
    openRef.current = open;
  }, []);

  const unregisterOpen = useCallback(() => {
    openRef.current = null;
  }, []);

  const openCustomize = useCallback(() => {
    openRef.current?.();
  }, []);

  const value = useMemo(
    () => ({ registerOpen, unregisterOpen, openCustomize }),
    [openCustomize, registerOpen, unregisterOpen]
  );

  return (
    <PortfolioCustomizeContext.Provider value={value}>
      {children}
    </PortfolioCustomizeContext.Provider>
  );
}

export function usePortfolioCustomize() {
  return useContext(PortfolioCustomizeContext);
}
