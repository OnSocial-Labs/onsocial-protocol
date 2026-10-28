'use client';

import { createContext, useContext, type ReactNode } from 'react';
import type { GlassSheetPresentation } from './glass-sheet.js';

const SheetHandoffContext = createContext(false);

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
