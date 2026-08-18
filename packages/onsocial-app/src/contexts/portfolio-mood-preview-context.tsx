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
  /**
   * After a successful on-chain save — keep this mood as committed
   * locally so the shell doesn’t snap back while `router.refresh()`
   * catches up (SSR props can lag until a hard reload).
   */
  commitMoodPreview: (moodId: PageMoodId) => void;
  registerMoodSheetOpen: (open: () => void) => void;
  unregisterMoodSheetOpen: () => void;
  registerMoodSheetClose: (close: () => void) => void;
  unregisterMoodSheetClose: () => void;
  requestCloseMoodSheet: () => void;
  requestOpenMoodSheet: () => void;
  /** DAO face — open stake sheet (council propose gate). */
  registerDaoStakeRequest: (open: () => void) => void;
  unregisterDaoStakeRequest: () => void;
  requestDaoStake: () => void;
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
  const [committedOverride, setCommittedOverride] =
    useState<ResolvedMood | null>(null);
  const closeMoodSheetRef = useRef<(() => void) | null>(null);
  const openMoodSheetRef = useRef<(() => void) | null>(null);
  const daoStakeRequestRef = useRef<(() => void) | null>(null);

  // Prefer optimistic override until RSC props catch up to the same mood id.
  const resolvedCommitted =
    committedOverride != null &&
    String(committedOverride.id) !== String(committedMood.id)
      ? committedOverride
      : committedMood;
  const committedMoodId = String(resolvedCommitted.id);

  const activePreview =
    previewMoodId !== null && previewMoodId !== committedMoodId
      ? previewMoodId
      : null;

  const discardMoodPreview = useCallback(() => {
    setPreviewMoodId(null);
  }, []);

  const commitMoodPreview = useCallback(
    (moodId: PageMoodId) => {
      setCommittedOverride(resolvePortfolioMoodForPreview(config, moodId));
      setPreviewMoodId(null);
    },
    [config]
  );

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

  const registerMoodSheetOpen = useCallback((open: () => void) => {
    openMoodSheetRef.current = open;
  }, []);

  const unregisterMoodSheetOpen = useCallback(() => {
    openMoodSheetRef.current = null;
  }, []);

  const registerMoodSheetClose = useCallback((close: () => void) => {
    closeMoodSheetRef.current = close;
  }, []);

  const unregisterMoodSheetClose = useCallback(() => {
    closeMoodSheetRef.current = null;
  }, []);

  const requestCloseMoodSheet = useCallback(() => {
    closeMoodSheetRef.current?.();
  }, []);

  const requestOpenMoodSheet = useCallback(() => {
    openMoodSheetRef.current?.();
  }, []);

  const registerDaoStakeRequest = useCallback((open: () => void) => {
    daoStakeRequestRef.current = open;
  }, []);

  const unregisterDaoStakeRequest = useCallback(() => {
    daoStakeRequestRef.current = null;
  }, []);

  const requestDaoStake = useCallback(() => {
    daoStakeRequestRef.current?.();
  }, []);

  const value = useMemo<PortfolioMoodPreviewContextValue>(() => {
    const isPreviewingMood = activePreview !== null;
    const effectiveMood = isPreviewingMood
      ? resolvePortfolioMoodForPreview(config, activePreview)
      : resolvedCommitted;

    return {
      committedMood: resolvedCommitted,
      previewMoodId: activePreview,
      effectiveMood,
      isPreviewingMood,
      setPreviewMood,
      discardMoodPreview,
      commitMoodPreview,
      registerMoodSheetOpen,
      unregisterMoodSheetOpen,
      registerMoodSheetClose,
      unregisterMoodSheetClose,
      requestCloseMoodSheet,
      requestOpenMoodSheet,
      registerDaoStakeRequest,
      unregisterDaoStakeRequest,
      requestDaoStake,
    };
  }, [
    activePreview,
    commitMoodPreview,
    config,
    discardMoodPreview,
    registerDaoStakeRequest,
    registerMoodSheetOpen,
    registerMoodSheetClose,
    requestCloseMoodSheet,
    requestDaoStake,
    requestOpenMoodSheet,
    resolvedCommitted,
    setPreviewMood,
    unregisterDaoStakeRequest,
    unregisterMoodSheetOpen,
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
