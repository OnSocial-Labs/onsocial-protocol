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

interface ComposeLauncherContextValue {
  /** Opens the composer for the current surface, or null when none applies. */
  composeAction: ComposeAction | null;
  setComposeAction: (action: ComposeAction | null) => void;
}

const ComposeLauncherContext =
  createContext<ComposeLauncherContextValue | null>(null);

export function ComposeLauncherProvider({ children }: { children: ReactNode }) {
  const [composeAction, setComposeActionState] =
    useState<ComposeAction | null>(null);

  const value = useMemo<ComposeLauncherContextValue>(
    () => ({
      composeAction,
      setComposeAction: (action) => setComposeActionState(() => action),
    }),
    [composeAction]
  );

  return (
    <ComposeLauncherContext.Provider value={value}>
      {children}
    </ComposeLauncherContext.Provider>
  );
}

export function useComposeLauncher(): ComposeAction | null {
  return useContext(ComposeLauncherContext)?.composeAction ?? null;
}

/**
 * Register the dock pen's compose action while the calling surface is mounted.
 * Pass null when the viewer cannot compose here (pen stays hidden).
 */
export function useRegisterComposeAction(action: ComposeAction | null) {
  const context = useContext(ComposeLauncherContext);
  const setComposeAction = context?.setComposeAction;

  useEffect(() => {
    if (!setComposeAction || !action) return;
    setComposeAction(action);
    return () => setComposeAction(null);
  }, [action, setComposeAction]);
}
