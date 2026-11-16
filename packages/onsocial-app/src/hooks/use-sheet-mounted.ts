'use client';

import { useState } from 'react';

/**
 * Mount overlay chrome on first open and keep it mounted afterwards —
 * closed sheets cost nothing until first use, while close animations and
 * internal state survive later closes.
 */
export function useSheetMounted(open: boolean): boolean {
  const [mounted, setMounted] = useState(open);
  if (open && !mounted) setMounted(true);
  return mounted || open;
}
