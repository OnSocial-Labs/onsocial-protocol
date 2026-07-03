'use client';

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type { PageMoodId } from '@onsocial/sdk';
import { resolvePortfolioMoodForPreview } from '@/lib/moods/resolve';
import type { ResolvedMood } from '@/lib/moods/types';
import type { PublicPageConfig } from '@/lib/page-data';

interface PortfolioMoodPreviewContextValue {
  committedMood: ResolvedMood;
  previewMoodId: PageMoodId | null;
  effectiveMood: ResolvedMood;
  isPreviewingMood: boolean;
  setPreviewMood: (moodId: PageMoodId) => void;
  discardMoodPreview: () => void;
  registerMoodSheetClose: (close: () => void) => void;
  unregisterMoodSheetClose: () => void;
  requestCloseMoodSheet: () => void;
}

const PortfolioMoodPreviewContext =
  createContext<PortfolioMoodPreviewContextValue | null>(null);

interface PortfolioMoodPreviewProviderProps {
  committedMood: ResolvedMood;
  config: PublicPageConfig;
  children: ReactNode;
}

export function PortfolioMoodPreviewProvider({
  committedMood,
  config,
  children,
}: PortfolioMoodPreviewProviderProps) {
  const [previewMoodId, setPreviewMoodId] = useState<PageMoodId | null>(null);
  const closeMoodSheetRef = useRef<(() => void) | null>(null);

  const committedMoodId = String(committedMood.id);

  const activePreview =
    previewMoodId !== null && previewMoodId !== committedMoodId
      ? previewMoodId
      : null;

  const discardMoodPreview = useCallback(() => {
    setPreviewMoodId(null);
  }, []);

  const setPreviewMood = useCallback(
    (moodId: PageMoodId) => {
      if (moodId === committedMoodId) {
        setPreviewMoodId(null);
        return;
      }

      setPreviewMoodId(moodId);
    },
    [committedMoodId]
  );

  const registerMoodSheetClose = useCallback((close: () => void) => {
    closeMoodSheetRef.current = close;
  }, []);

  const unregisterMoodSheetClose = useCallback(() => {
    closeMoodSheetRef.current = null;
  }, []);

  const requestCloseMoodSheet = useCallback(() => {
    closeMoodSheetRef.current?.();
  }, []);

  const value = useMemo<PortfolioMoodPreviewContextValue>(() => {
    const isPreviewingMood = activePreview !== null;
    const effectiveMood = isPreviewingMood
      ? resolvePortfolioMoodForPreview(config, activePreview)
      : committedMood;

    return {
      committedMood,
      previewMoodId: activePreview,
      effectiveMood,
      isPreviewingMood,
      setPreviewMood,
      discardMoodPreview,
      registerMoodSheetClose,
      unregisterMoodSheetClose,
      requestCloseMoodSheet,
    };
  }, [
    activePreview,
    committedMood,
    config,
    discardMoodPreview,
    registerMoodSheetClose,
    requestCloseMoodSheet,
    setPreviewMood,
    unregisterMoodSheetClose,
  ]);

  return (
    <PortfolioMoodPreviewContext.Provider value={value}>
      {children}
    </PortfolioMoodPreviewContext.Provider>
  );
}

export function usePortfolioMoodPreview(): PortfolioMoodPreviewContextValue {
  const context = useContext(PortfolioMoodPreviewContext);
  if (!context) {
    throw new Error(
      'usePortfolioMoodPreview must be used within PortfolioMoodPreviewProvider'
    );
  }
  return context;
}

/** Optional — surfaces outside the provider (e.g. when sheet is closed). */
export function usePortfolioMoodPreviewOptional() {
  return useContext(PortfolioMoodPreviewContext);
}
