'use client';

import { useEffect, useRef, useState } from 'react';
import {
  useSheetHandoff,
  type GlassSheetPresentation,
} from '@onsocial/ui';
import {
  GUILD_SETTINGS_HANDOFF_CROSSFADE_MS,
  guildSettingsDrawerPresentation,
  latchOpenedSwap,
} from '@/features/guilds/guild-sheet-handoff';

/**
 * Settings → drawer: crossfade once (`swap`), then nested sheets use their
 * own presentation (`appear` / `enter`). Clears the handoff flag after the
 * replace fade finishes — not on the first paint (that killed the fade).
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
    if (!onPresented) return;
    const timer = window.setTimeout(
      onPresented,
      GUILD_SETTINGS_HANDOFF_CROSSFADE_MS
    );
    return () => window.clearTimeout(timer);
  }, [open, latchedSwap, onPresented]);

  return guildSettingsDrawerPresentation(open, handoff, latchedSwap);
}
