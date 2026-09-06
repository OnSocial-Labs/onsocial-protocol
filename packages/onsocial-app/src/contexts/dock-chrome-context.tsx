'use client';

import {
  createContext,
  useContext,
  useLayoutEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

export type DockBackRegistration = {
  fallbackHref: string;
  ariaLabel?: string;
  /** Prefer programmatic back (e.g. close a thread pane) over history. */
  onBack?: () => void;
};

interface DockChromeContextValue {
  dockBack: DockBackRegistration | null;
  setDockBack: (entry: DockBackRegistration | null) => void;
  headerOwnsConnect: boolean;
  setHeaderOwnsConnect: (owns: boolean) => void;
}

const DockChromeContext = createContext<DockChromeContextValue | null>(null);

/** Dock leave stays visible unless the launcher is open. */
export function resolveDockBackVisible({
  dockBack,
  launcherOpen,
}: {
  dockBack: unknown;
  launcherOpen: boolean;
}): boolean {
  return Boolean(dockBack) && !launcherOpen;
}

/** Dock Connect hint waits when the header already owns Connect. */
export function resolveDockConnectHintVisible({
  headerOwnsConnect,
  isConnected,
}: {
  headerOwnsConnect: boolean;
  isConnected: boolean;
}): boolean {
  return !isConnected && !headerOwnsConnect;
}

export function DockChromeProvider({ children }: { children: ReactNode }) {
  const [dockBack, setDockBack] = useState<DockBackRegistration | null>(null);
  const [headerOwnsConnect, setHeaderOwnsConnect] = useState(false);
  const value = useMemo(
    () => ({
      dockBack,
      setDockBack,
      headerOwnsConnect,
      setHeaderOwnsConnect,
    }),
    [dockBack, headerOwnsConnect]
  );
  return (
    <DockChromeContext.Provider value={value}>
      {children}
    </DockChromeContext.Provider>
  );
}

export function useDockBack(): DockBackRegistration | null {
  return useContext(DockChromeContext)?.dockBack ?? null;
}

export function useHeaderOwnsConnect(): boolean {
  return useContext(DockChromeContext)?.headerOwnsConnect ?? false;
}

/** Register contextual back on the summon dock (clears on unmount). */
export function useRegisterDockBack(entry: DockBackRegistration | null) {
  const context = useContext(DockChromeContext);
  const setDockBack = context?.setDockBack;

  useLayoutEffect(() => {
    if (!setDockBack) return;
    setDockBack(entry);
    return () => setDockBack(null);
  }, [entry?.ariaLabel, entry?.fallbackHref, entry?.onBack, entry, setDockBack]);
}

/** Header already has Connect / Start drop — hide the dock Connect hint. */
export function useRegisterHeaderOwnsConnect(owns: boolean) {
  const context = useContext(DockChromeContext);
  const setHeaderOwnsConnect = context?.setHeaderOwnsConnect;

  useLayoutEffect(() => {
    if (!setHeaderOwnsConnect) return;
    setHeaderOwnsConnect(owns);
    return () => setHeaderOwnsConnect(false);
  }, [owns, setHeaderOwnsConnect]);
}
