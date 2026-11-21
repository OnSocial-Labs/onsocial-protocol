'use client';

import { useState } from 'react';

/**
 * Mount overlay chrome on first intent/open and keep it mounted afterwards.
 * Pass `open || warm` so pointerdown can seat the sheet before click, while
 * idle cards stay out of the tree. Close animations and internal state
 * survive later closes once mounted.
 */
export function useSheetMounted(open: boolean): boolean {
  const [mounted, setMounted] = useState(open);
  if (open && !mounted) setMounted(true);
  return mounted || open;
}
