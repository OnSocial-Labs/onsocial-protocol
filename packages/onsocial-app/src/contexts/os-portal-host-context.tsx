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
  /** Re-read which card is live after the parked feed is covered. */
  noteHosts: () => void;
}

/** The kept Home feed is not a card once the next screen covers it. */
function coveredFeedHost(node: HTMLElement): boolean {
  return Boolean(node.closest('[data-feed-session="covered"]'));
}

function insideFeedSession(node: HTMLElement): boolean {
  return Boolean(node.closest('[data-feed-session]'));
}

const OsPortalHostContext = createContext<OsPortalHostContextValue | null>(
  null
);

export function OsPortalHostProvider({ children }: { children: ReactNode }) {
  const [hosts, setHosts] = useState<HostEntry[]>([]);
  const [hostEpoch, setHostEpoch] = useState(0);
  const nextId = useRef(0);

  const register = useCallback((node: HTMLElement) => {
    const id = ++nextId.current;
    setHosts((prev) => [...prev, { id, node }]);
    return () => {
      setHosts((prev) => prev.filter((entry) => entry.id !== id));
    };
  }, []);

  const noteHosts = useCallback(() => {
    setHostEpoch((epoch) => epoch + 1);
  }, []);

  // hostEpoch forces a re-read after the feed is covered. The DOM flag is
  // not in React state, so the render has to run again to see it.
  void hostEpoch;
  // A profile card always wins over the kept feed. While the feed is briefly
  // live again, sheets must stay on the profile — moving them into the feed
  // hides them the moment the feed is covered.
  let host: HTMLElement | null = null;
  let feedHost: HTMLElement | null = null;
  for (let index = hosts.length - 1; index >= 0; index -= 1) {
    const node = hosts[index]!.node;
    if (!node.isConnected) continue;
    if (insideFeedSession(node)) {
      if (!feedHost && !coveredFeedHost(node)) feedHost = node;
      continue;
    }
    host = node;
    break;
  }
  if (!host) host = feedHost;

  const value = useMemo(
    () => ({ host, register, noteHosts }),
    [host, noteHosts, register]
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

/** Ask the provider to skip a feed card that just became covered. */
export function useNoteOsPortalHosts(): () => void {
  return useContext(OsPortalHostContext)?.noteHosts ?? (() => {});
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
