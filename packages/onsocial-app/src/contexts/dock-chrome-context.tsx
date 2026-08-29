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
  searchChromeActive: boolean;
  setSearchChromeActive: (active: boolean) => void;
}

const DockChromeContext = createContext<DockChromeContextValue | null>(null);

/** One back at a time — hide dock back while mobile header search is expanded. */
export function resolveDockBackVisible({
  dockBack,
  launcherOpen,
  searchChromeActive,
}: {
  dockBack: unknown;
  launcherOpen: boolean;
  searchChromeActive: boolean;
}): boolean {
  return Boolean(dockBack) && !launcherOpen && !searchChromeActive;
}

export function DockChromeProvider({ children }: { children: ReactNode }) {
  const [dockBack, setDockBack] = useState<DockBackRegistration | null>(null);
  const [searchChromeActive, setSearchChromeActive] = useState(false);
  const value = useMemo(
    () => ({
      dockBack,
      setDockBack,
      searchChromeActive,
      setSearchChromeActive,
    }),
    [dockBack, searchChromeActive]
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

export function useSearchChromeActive(): boolean {
  return useContext(DockChromeContext)?.searchChromeActive ?? false;
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

/** Mobile nav search is expanded — suppress the dock back until it dismisses. */
export function useRegisterSearchChromeActive(active: boolean) {
  const setSearchChromeActive = useContext(DockChromeContext)
    ?.setSearchChromeActive;

  useLayoutEffect(() => {
    if (!setSearchChromeActive) return;
    setSearchChromeActive(active);
    return () => setSearchChromeActive(false);
  }, [active, setSearchChromeActive]);
}
