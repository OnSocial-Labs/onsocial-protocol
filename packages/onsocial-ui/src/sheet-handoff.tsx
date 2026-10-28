'use client';

import {
  createContext,
  useContext,
  useEffect,
  useRef,
  type ReactNode,
} from 'react';
import type { GlassSheetPresentation } from './glass-sheet.js';

const SheetHandoffContext = createContext(false);

const activeHandoffProviders = new Set<symbol>();
let handoffRestoreTarget: HTMLElement | null = null;

/**
 * Publish whether this provider is the active replace. A module bridge so the
 * sheet that is unmounting can see the flag even when it sits outside the
 * provider. Cleared when no provider is active, so a stale opener cannot leak
 * into a later sheet.
 */
export function noteHandoffProvider(id: symbol, active: boolean) {
  if (active) activeHandoffProviders.add(id);
  else activeHandoffProviders.delete(id);
  if (activeHandoffProviders.size === 0) handoffRestoreTarget = null;
}

export function releaseHandoffProvider(id: symbol) {
  noteHandoffProvider(id, false);
}

/** Test isolation. Providers also release themselves on unmount. */
export function resetHandoffFocusState() {
  activeHandoffProviders.clear();
  handoffRestoreTarget = null;
}

export function sheetHandoffFocusActive(): boolean {
  return activeHandoffProviders.size > 0;
}

export function stashHandoffRestoreTarget(target: HTMLElement | null) {
  if (!target) return;
  handoffRestoreTarget = target;
}

/** Take the opener stashed by the sheet that just unmounted. */
export function readHandoffRestoreTarget(
  isConnected: (node: HTMLElement) => boolean = (node) => node.isConnected
): HTMLElement | null {
  const target = handoffRestoreTarget;
  handoffRestoreTarget = null;
  if (target && isConnected(target)) return target;
  return null;
}

/**
 * A sheet replaced while it was still open must not focus its trigger.
 * A sheet that is closing in place (panel still mounted) still does.
 */
export function decideSheetFocusRelease(input: {
  handoffActive: boolean;
  panelConnected: boolean;
  restoreTarget: HTMLElement | null;
}): { focusTarget: HTMLElement | null; stashTarget: HTMLElement | null } {
  if (input.handoffActive && !input.panelConnected) {
    return { focusTarget: null, stashTarget: input.restoreTarget };
  }
  return { focusTarget: input.restoreTarget, stashTarget: null };
}

/** Incoming sheet keeps the stashed opener, otherwise whatever is focused. */
export function decideSheetFocusCapture(
  handed: HTMLElement | null,
  activeElement: HTMLElement | null
): HTMLElement | null {
  return handed ?? activeElement;
}

/**
 * True while a menu or settings sheet is being replaced by the next one.
 * Glass sheets that would have slid in (`enter`) mount with `swap` and a
 * short fade instead. Explicit `appear` and `swap` are left alone.
 */
export function SheetHandoffProvider({
  active,
  children,
}: {
  active: boolean;
  children: ReactNode;
}) {
  const idRef = useRef(Symbol());
  noteHandoffProvider(idRef.current, active);
  useEffect(() => {
    const id = idRef.current;
    return () => releaseHandoffProvider(id);
  }, []);

  return (
    <SheetHandoffContext.Provider value={active}>
      {children}
    </SheetHandoffContext.Provider>
  );
}

export function useSheetHandoff(): boolean {
  return useContext(SheetHandoffContext);
}

export function resolveHandoffPresentation(
  presentation: GlassSheetPresentation,
  handoff: boolean
): GlassSheetPresentation {
  return handoff && presentation === 'enter' ? 'swap' : presentation;
}
