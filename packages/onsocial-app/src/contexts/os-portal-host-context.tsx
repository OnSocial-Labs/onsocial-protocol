'use client';

/**
 * Explicit portal target for OS slide-overs — the live phone card
 * (`.app-surface` with overflow clip). Screens register on mount; slide-overs
 * portal into the topmost host so they slide from the OS edge only.
 */

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type RefCallback,
} from 'react';

interface HostEntry {
  id: number;
  node: HTMLElement;
}

interface OsPortalHostContextValue {
  /** Topmost registered OS / portfolio card. */
  host: HTMLElement | null;
  register: (node: HTMLElement) => () => void;
}

const OsPortalHostContext = createContext<OsPortalHostContextValue | null>(
  null
);

export function OsPortalHostProvider({ children }: { children: ReactNode }) {
  const [hosts, setHosts] = useState<HostEntry[]>([]);
  const nextId = useRef(0);

  const register = useCallback((node: HTMLElement) => {
    const id = ++nextId.current;
    setHosts((prev) => [...prev, { id, node }]);
    return () => {
      setHosts((prev) => prev.filter((entry) => entry.id !== id));
    };
  }, []);

  const host = hosts.length > 0 ? hosts[hosts.length - 1]!.node : null;

  const value = useMemo(
    () => ({ host, register }),
    [host, register]
  );

  return (
    <OsPortalHostContext.Provider value={value}>
      {children}
    </OsPortalHostContext.Provider>
  );
}

/** Active clip host for `OsSlideOverScreen` (null → fall back to `document.body`). */
export function useOsPortalHost(): HTMLElement | null {
  return useContext(OsPortalHostContext)?.host ?? null;
}

/**
 * Callback ref — put on the OS / portfolio card root that should clip slides.
 */
export function useRegisterOsPortalHost<
  T extends HTMLElement = HTMLElement,
>(): RefCallback<T> {
  const register = useContext(OsPortalHostContext)?.register;
  const unregisterRef = useRef<(() => void) | null>(null);

  return useCallback(
    (node: T | null) => {
      unregisterRef.current?.();
      unregisterRef.current = null;
      if (node && register) {
        unregisterRef.current = register(node);
      }
    },
    [register]
  );
}
