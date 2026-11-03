'use client';

import { useEffect, useRef, useState } from 'react';
import {
  useSheetHandoff,
  type GlassSheetPresentation,
} from '@onsocial/ui';
import { latchOpenedSwap } from '@/features/guilds/guild-sheet-handoff';

/**
 * Settings → drawer: crossfade once (`swap`), then slide nested sheets as
 * drawers. Clears the handoff flag after the drawer has presented.
 */
export function useGuildSettingsDrawerHandoff(
  open: boolean,
  onPresented?: () => void
): GlassSheetPresentation {
  const handoff = useSheetHandoff();
  const [latchedSwap, setLatchedSwap] = useState(false);
  const nextLatch = latchOpenedSwap(open, handoff, latchedSwap);
  if (nextLatch !== latchedSwap) setLatchedSwap(nextLatch);

  const presentedRef = useRef(false);

  useEffect(() => {
    if (!open) {
      presentedRef.current = false;
      return;
    }
    if (!latchedSwap || presentedRef.current) return;
    presentedRef.current = true;
    onPresented?.();
  }, [open, latchedSwap, onPresented]);

  return latchedSwap ? 'swap' : 'enter';
}
