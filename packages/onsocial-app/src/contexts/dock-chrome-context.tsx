'use client';

import {
  createContext,
  useCallback,
  useContext,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

export type DockBackRegistration = {
  fallbackHref: string;
  ariaLabel?: string;
  /** Prefer programmatic back (e.g. close a thread pane) over history. */
  onBack?: () => void;
};

/** Trailing dock slot — same place as the compose pen, for a page action. */
export type DockActionRegistration = {
  ariaLabel: string;
  pressed?: boolean;
  disabled?: boolean;
  onClick: () => void;
  icon: ReactNode;
};

export type DockBackStackItem = {
  id: string;
  entry: DockBackRegistration;
};

/**
 * Top registration wins. A drop sheet over Market keeps Market's Back
 * underneath and restores it when the sheet unmounts — a single slot's
 * cleanup used to clear the page Back and leave none.
 */
export function upsertDockBackStack(
  stack: readonly DockBackStackItem[],
  item: DockBackStackItem
): DockBackStackItem[] {
  const index = stack.findIndex((row) => row.id === item.id);
  if (index === -1) return [...stack, item];
  const next = stack.slice();
  next[index] = item;
  return next;
}

export function popDockBackStack(
  stack: readonly DockBackStackItem[],
  id: string
): DockBackStackItem[] {
  return stack.filter((row) => row.id !== id);
}

/** Move this id to the top so a later page registration cannot cover it. */
export function claimDockBackTop(
  stack: readonly DockBackStackItem[],
  item: DockBackStackItem
): DockBackStackItem[] {
  return [...stack.filter((row) => row.id !== item.id), item];
}

export function topDockBack(
  stack: readonly DockBackStackItem[]
): DockBackRegistration | null {
  return stack.length > 0 ? (stack[stack.length - 1]?.entry ?? null) : null;
}

interface DockChromeContextValue {
  dockBack: DockBackRegistration | null;
  upsertDockBack: (item: DockBackStackItem) => void;
  claimDockBack: (item: DockBackStackItem) => void;
  popDockBack: (id: string) => void;
  dockAction: DockActionRegistration | null;
  setDockAction: (entry: DockActionRegistration | null) => void;
  headerOwnsConnect: boolean;
  setHeaderOwnsConnect: (owns: boolean) => void;
  /** Immersive reader / listen tucked chrome — dock follows. */
  immersiveChromeQuiet: boolean;
  setImmersiveChromeQuiet: (quiet: boolean) => void;
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
  const [dockBackStack, setDockBackStack] = useState<DockBackStackItem[]>([]);
  const [dockAction, setDockAction] = useState<DockActionRegistration | null>(
    null
  );
  const [headerOwnsConnect, setHeaderOwnsConnect] = useState(false);
  const [immersiveChromeQuiet, setImmersiveChromeQuiet] = useState(false);
  const dockBack = topDockBack(dockBackStack);
  const upsertDockBack = useCallback((item: DockBackStackItem) => {
    setDockBackStack((current) => upsertDockBackStack(current, item));
  }, []);
  const popDockBack = useCallback((id: string) => {
    setDockBackStack((current) => {
      if (!current.some((row) => row.id === id)) return current;
      return popDockBackStack(current, id);
    });
  }, []);
  const claimDockBack = useCallback((item: DockBackStackItem) => {
    setDockBackStack((current) => {
      if (current[current.length - 1]?.id === item.id) return current;
      return claimDockBackTop(current, item);
    });
  }, []);
  const value = useMemo(
    () => ({
      dockBack,
      upsertDockBack,
      claimDockBack,
      popDockBack,
      dockAction,
      setDockAction,
      headerOwnsConnect,
      setHeaderOwnsConnect,
      immersiveChromeQuiet,
      setImmersiveChromeQuiet,
    }),
    [
      dockAction,
      dockBack,
      headerOwnsConnect,
      immersiveChromeQuiet,
      claimDockBack,
      popDockBack,
      upsertDockBack,
    ]
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

export function useDockAction(): DockActionRegistration | null {
  return useContext(DockChromeContext)?.dockAction ?? null;
}

export function useHeaderOwnsConnect(): boolean {
  return useContext(DockChromeContext)?.headerOwnsConnect ?? false;
}

export function useImmersiveChromeQuiet(): boolean {
  return useContext(DockChromeContext)?.immersiveChromeQuiet ?? false;
}

/** Register contextual back on the summon dock (pops this id on unmount). */
export function useRegisterDockBack(entry: DockBackRegistration | null) {
  const context = useContext(DockChromeContext);
  const upsertDockBack = context?.upsertDockBack;
  const popDockBack = context?.popDockBack;
  const id = useId();
  const entryRef = useRef(entry);
  const key = entry
    ? [
        entry.fallbackHref,
        entry.ariaLabel ?? '',
        entry.onBack ? '1' : '0',
      ].join('\0')
    : '';

  useLayoutEffect(() => {
    entryRef.current = entry;
  }, [entry]);

  useLayoutEffect(() => {
    if (!upsertDockBack || !popDockBack) return;
    const current = entryRef.current;
    if (!current) {
      popDockBack(id);
      return;
    }
    // Update in place. A cleanup-then-push let the page under a drop sheet
    // jump back to the top and steal dock Back.
    upsertDockBack({
      id,
      entry: {
        fallbackHref: current.fallbackHref,
        ariaLabel: current.ariaLabel,
        onBack: current.onBack
          ? () => {
              entryRef.current?.onBack?.();
            }
          : undefined,
      },
    });
  }, [id, key, popDockBack, upsertDockBack]);

  useLayoutEffect(() => {
    return () => popDockBack?.(id);
  }, [id, popDockBack]);
}

const DROP_SHEET_DOCK_ID = 'drop-sheet-dock';

/**
 * While a drop sheet is open, keep its Back above any page that re-registers
 * (desktop Market remounts its screen after the sheet and used to steal Back).
 */
export function useClaimDropSheetDockBack(
  active: boolean,
  entry: DockBackRegistration | null
) {
  const context = useContext(DockChromeContext);
  const claimDockBack = context?.claimDockBack;
  const popDockBack = context?.popDockBack;
  const entryRef = useRef(entry);

  useLayoutEffect(() => {
    entryRef.current = entry;
  }, [entry]);

  useLayoutEffect(() => {
    if (!claimDockBack || !popDockBack) return;
    const current = entryRef.current;
    if (!active || !current) {
      popDockBack(DROP_SHEET_DOCK_ID);
      return;
    }
    claimDockBack({
      id: DROP_SHEET_DOCK_ID,
      entry: {
        fallbackHref: current.fallbackHref,
        ariaLabel: current.ariaLabel ?? 'Back',
        onBack: () => {
          entryRef.current?.onBack?.();
        },
      },
    });
  });
}

/**
 * Register a trailing dock action (clears on unmount).
 * Wins over the compose pen while set — Admit uses it for the camera.
 */
export function useRegisterDockAction(entry: DockActionRegistration | null) {
  const context = useContext(DockChromeContext);
  const setDockAction = context?.setDockAction;
  const entryRef = useRef(entry);
  const key = entry
    ? [
        entry.ariaLabel,
        entry.pressed ? '1' : '0',
        entry.disabled ? '1' : '0',
      ].join('\0')
    : '';

  useLayoutEffect(() => {
    entryRef.current = entry;
  }, [entry]);

  useLayoutEffect(() => {
    if (!setDockAction) return;
    const current = entryRef.current;
    if (!current) {
      setDockAction(null);
      return;
    }
    setDockAction({
      ariaLabel: current.ariaLabel,
      pressed: current.pressed,
      disabled: current.disabled,
      icon: current.icon,
      onClick: () => entryRef.current?.onClick(),
    });
    return () => setDockAction(null);
  }, [key, setDockAction]);
}

/** Header already has Connect / Publish — hide the dock Connect hint. */
export function useRegisterHeaderOwnsConnect(owns: boolean) {
  const context = useContext(DockChromeContext);
  const setHeaderOwnsConnect = context?.setHeaderOwnsConnect;

  useLayoutEffect(() => {
    if (!setHeaderOwnsConnect) return;
    setHeaderOwnsConnect(owns);
    return () => setHeaderOwnsConnect(false);
  }, [owns, setHeaderOwnsConnect]);
}

/** Immersive Read/Listen chrome quiet — tuck the summon dock with it. */
export function useRegisterImmersiveChromeQuiet(quiet: boolean) {
  const context = useContext(DockChromeContext);
  const setImmersiveChromeQuiet = context?.setImmersiveChromeQuiet;

  useLayoutEffect(() => {
    if (!setImmersiveChromeQuiet) return;
    setImmersiveChromeQuiet(quiet);
    return () => setImmersiveChromeQuiet(false);
  }, [quiet, setImmersiveChromeQuiet]);
}
