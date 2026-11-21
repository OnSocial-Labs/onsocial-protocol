'use client';

import { useState } from 'react';

/**
 * Mount overlay chrome on first open and keep it mounted afterwards.
 * Closed GlassSheets still probe the page host every parent redraw — do not
 * leave them in the tree before first open. Close animations and internal
 * state survive later closes once mounted.
 */
export function useSheetMounted(open: boolean): boolean {
  const [mounted, setMounted] = useState(open);
  if (open && !mounted) setMounted(true);
  return mounted || open;
}
