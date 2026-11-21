'use client';

import { useCallback, useState } from 'react';

/**
 * Mount overlay chrome while `open` and through the leave animation.
 * Pass the returned `onClosed` to the sheet so idle rows drop the tree.
 * Prefetch on pointerdown; do not keep warm mounts parked on the card.
 */
export function useSheetMounted(open: boolean): {
  mounted: boolean;
  onClosed: () => void;
} {
  const [held, setHeld] = useState(false);
  if (open && !held) {
    setHeld(true);
  }
  const onClosed = useCallback(() => {
    setHeld(false);
  }, []);
  return { mounted: open || held, onClosed };
}
