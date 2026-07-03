'use client';

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type { ResolvedMood } from '@/lib/moods/types';

interface ViewerWalletMoodContextValue {
  mood: ResolvedMood | null;
  setMood: (mood: ResolvedMood) => void;
  clearMood: () => void;
}

const ViewerWalletMoodContext = createContext<ViewerWalletMoodContextValue>({
  mood: null,
  setMood: () => {},
  clearMood: () => {},
});

export function ViewerWalletMoodProvider({ children }: { children: ReactNode }) {
  const [mood, setMoodState] = useState<ResolvedMood | null>(null);

  const setMood = useCallback((next: ResolvedMood) => {
    setMoodState(next);
  }, []);

  const clearMood = useCallback(() => {
    setMoodState(null);
  }, []);

  const value = useMemo(
    () => ({ mood, setMood, clearMood }),
    [clearMood, mood, setMood]
  );

  return (
    <ViewerWalletMoodContext.Provider value={value}>
      {children}
    </ViewerWalletMoodContext.Provider>
  );
}

export function useViewerWalletMoodContext() {
  return useContext(ViewerWalletMoodContext);
}
