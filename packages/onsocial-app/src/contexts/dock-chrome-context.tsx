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
};

interface DockChromeContextValue {
  dockBack: DockBackRegistration | null;
  setDockBack: (entry: DockBackRegistration | null) => void;
}

const DockChromeContext = createContext<DockChromeContextValue | null>(null);

export function DockChromeProvider({ children }: { children: ReactNode }) {
  const [dockBack, setDockBack] = useState<DockBackRegistration | null>(null);
  const value = useMemo(
    () => ({ dockBack, setDockBack }),
    [dockBack]
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

/** Register contextual back on the summon dock (clears on unmount). */
export function useRegisterDockBack(entry: DockBackRegistration | null) {
  const context = useContext(DockChromeContext);
  const setDockBack = context?.setDockBack;

  useLayoutEffect(() => {
    if (!setDockBack) return;
    setDockBack(entry);
    return () => setDockBack(null);
  }, [entry?.ariaLabel, entry?.fallbackHref, entry, setDockBack]);
}
