'use client';

import { useSyncExternalStore } from 'react';
import {
  osDropSheetOpenNow,
  subscribeOsDropSheetOpen,
} from '@/lib/sheet-z';

/** Soft drop sheet is covering the page — media faces keep the dock. */
export function useOsDropSheetOpen(): boolean {
  return useSyncExternalStore(
    subscribeOsDropSheetOpen,
    osDropSheetOpenNow,
    () => false
  );
}
