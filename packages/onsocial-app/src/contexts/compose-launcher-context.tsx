'use client';

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

type ComposeAction = () => void;

/** What the dock action button creates — picks the glyph (pen / stars / mint). */
export type ComposeKind = 'post' | 'drop' | 'mint' | 'propose';

export interface ComposeLauncherEntry {
  action: ComposeAction;
  kind: ComposeKind;
}

interface ComposeLauncherContextValue {
  /** Composer for the current surface, or null when none applies. */
  compose: ComposeLauncherEntry | null;
  setCompose: (entry: ComposeLauncherEntry | null) => void;
}

const ComposeLauncherContext =
  createContext<ComposeLauncherContextValue | null>(null);

export function ComposeLauncherProvider({ children }: { children: ReactNode }) {
  const [compose, setCompose] = useState<ComposeLauncherEntry | null>(null);

  const value = useMemo<ComposeLauncherContextValue>(
    () => ({ compose, setCompose }),
    [compose]
  );

  return (
    <ComposeLauncherContext.Provider value={value}>
      {children}
    </ComposeLauncherContext.Provider>
  );
}

export function useComposeLauncher(): ComposeLauncherEntry | null {
  return useContext(ComposeLauncherContext)?.compose ?? null;
}

/**
 * Register the dock action while the calling surface is mounted.
 * Pass null when the viewer cannot compose here (button stays hidden).
 * `kind` picks the glyph: pen for posts (default), purple stars for drops,
 * green stars for mint, pen for propose.
 */
export function useRegisterComposeAction(
  action: ComposeAction | null,
  kind: ComposeKind = 'post'
) {
  const context = useContext(ComposeLauncherContext);
  const setCompose = context?.setCompose;

  useEffect(() => {
    if (!setCompose || !action) return;
    setCompose({ action, kind });
    return () => setCompose(null);
  }, [action, kind, setCompose]);
}
