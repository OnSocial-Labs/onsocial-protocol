'use client';

import { useLayoutEffect, useRef } from 'react';
import {
  pushSheet,
  markSheetGone,
  registerOpenSheet,
  replaceSheet,
  reportSheetPresence,
  unregisterOpenSheet,
  type SheetStackKind,
} from './sheet-motion.js';

const sheetStackApi = { replace: replaceSheet, push: pushSheet };

/** Ask the shell to replace or push. Present and cover are inferred. */
export function useSheetStack(): {
  replace: () => void;
  push: () => void;
} {
  return sheetStackApi;
}

/**
 * Count a layer that does not render through GlassSheet (a slide-over) so a
 * drawer opened on top of it pushes or covers instead of presenting alone.
 */
export function useSheetStackEntry(
  open: boolean,
  kind: SheetStackKind = 'page'
): void {
  const id = useRef(Symbol('sheet-stack-entry')).current;
  const hadOpenRef = useRef(false);
  if (open || hadOpenRef.current) {
    reportSheetPresence(id, kind, open);
    if (open) hadOpenRef.current = true;
    else hadOpenRef.current = false;
  }
  useLayoutEffect(() => {
    if (!open) return;
    registerOpenSheet(id, kind);
    return () => {
      unregisterOpenSheet(id);
      markSheetGone(id);
    };
  }, [id, kind, open]);
}
