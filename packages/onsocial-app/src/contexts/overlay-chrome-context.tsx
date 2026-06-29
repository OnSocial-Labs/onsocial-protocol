'use client';

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
  type RefObject,
} from 'react';

export interface OverlayChromeConfig {
  ariaTitle: string;
  scrollBodyRef?: RefObject<HTMLDivElement | null>;
}

interface OverlayChromeContextValue {
  chrome: OverlayChromeConfig | null;
  registerChrome: (config: OverlayChromeConfig) => void;
  clearChrome: () => void;
  headerPortal: HTMLElement | null;
  setHeaderPortal: (node: HTMLElement | null) => void;
}

const OverlayChromeContext = createContext<OverlayChromeContextValue | null>(
  null
);

export function OverlayChromeProvider({ children }: { children: ReactNode }) {
  const [chrome, setChrome] = useState<OverlayChromeConfig | null>(null);
  const [headerPortal, setHeaderPortalState] = useState<HTMLElement | null>(
    null
  );

  const registerChrome = useCallback((config: OverlayChromeConfig) => {
    setChrome(config);
  }, []);

  const clearChrome = useCallback(() => {
    setChrome(null);
  }, []);

  const setHeaderPortal = useCallback((node: HTMLElement | null) => {
    setHeaderPortalState(node);
  }, []);

  const value = useMemo(
    () => ({
      chrome,
      registerChrome,
      clearChrome,
      headerPortal,
      setHeaderPortal,
    }),
    [chrome, clearChrome, headerPortal, registerChrome, setHeaderPortal]
  );

  return (
    <OverlayChromeContext.Provider value={value}>
      {children}
    </OverlayChromeContext.Provider>
  );
}

export function useOverlayChrome(): OverlayChromeConfig | null {
  return useContext(OverlayChromeContext)?.chrome ?? null;
}

export function useOverlayChromeRegister(): (
  config: OverlayChromeConfig
) => void {
  const context = useContext(OverlayChromeContext);
  if (!context) {
    throw new Error(
      'useOverlayChromeRegister must be used within OverlayChromeProvider'
    );
  }
  return context.registerChrome;
}

export function useOverlayChromeClear(): () => void {
  const context = useContext(OverlayChromeContext);
  return context?.clearChrome ?? (() => {});
}

export function useOverlayHeaderPortal(): HTMLElement | null {
  return useContext(OverlayChromeContext)?.headerPortal ?? null;
}

export function useOverlayHeaderPortalTarget(): (
  node: HTMLElement | null
) => void {
  const context = useContext(OverlayChromeContext);
  return context?.setHeaderPortal ?? (() => {});
}
