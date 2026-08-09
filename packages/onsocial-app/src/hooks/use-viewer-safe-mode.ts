'use client';

import { useCallback, useSyncExternalStore } from 'react';
import {
  readSafeMode,
  subscribeSafeMode,
  writeSafeMode,
} from '@/lib/viewer-safe-mode';

export function useViewerSafeMode() {
  const safeMode = useSyncExternalStore(
    subscribeSafeMode,
    readSafeMode,
    () => true
  );

  const setSafeMode = useCallback((enabled: boolean) => {
    writeSafeMode(enabled);
  }, []);

  const toggleSafeMode = useCallback(() => {
    writeSafeMode(!readSafeMode());
  }, []);

  return { safeMode, setSafeMode, toggleSafeMode };
}
