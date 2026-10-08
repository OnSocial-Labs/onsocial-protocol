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
import { resolvePageMoodId, type PageMoodId } from '@onsocial/sdk';
import {
  resolvePortfolioMoodForPreview,
  resolvePortfolioMoodForTintPreview,
} from '@/lib/moods/resolve';
import type { ResolvedMood } from '@/lib/moods/types';
import type { PublicPageConfig } from '@/lib/page-data';

export interface MoodTintPreview {
  moodId: PageMoodId;
  hue: number;
}

interface PortfolioMoodPreviewContextValue {
  committedMood: ResolvedMood;
  previewMoodId: PageMoodId | null;
  /** Unsaved ink hue. Page shows it; chain write waits for Save. */
  previewTint: MoodTintPreview | null;
  /** Hue kept locally after Save until the refreshed config matches. */
  committedTint: MoodTintPreview | null;
  effectiveMood: ResolvedMood;
  isPreviewingMood: boolean;
  setPreviewMood: (moodId: PageMoodId) => void;
  setPreviewTint: (moodId: PageMoodId, hue: number) => void;
  discardMoodPreview: () => void;
  /**
   * After a successful on-chain save — keep this mood as committed
   * locally so the shell doesn’t snap back while `router.refresh()`
   * catches up (SSR props can lag until a hard reload).
   */
  commitMoodPreview: (moodId: PageMoodId) => void;
  commitTintPreview: (moodId: PageMoodId, hue: number) => void;
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
  const [previewTint, setPreviewTintState] = useState<MoodTintPreview | null>(
    null
  );
  const [committedTint, setCommittedTint] = useState<MoodTintPreview | null>(
    null
  );
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
    setPreviewTintState(null);
  }, []);

  const commitMoodPreview = useCallback(
    (moodId: PageMoodId) => {
      setCommittedOverride(resolvePortfolioMoodForPreview(config, moodId));
      setPreviewMoodId(null);
      setPreviewTintState(null);
    },
    [config]
  );

  const commitTintPreview = useCallback((moodId: PageMoodId, hue: number) => {
    setCommittedTint({ moodId, hue });
    setPreviewTintState(null);
  }, []);

  const setPreviewMood = useCallback(
    (moodId: PageMoodId) => {
      setPreviewTintState(null);
      if (moodId === committedMoodId) {
        setPreviewMoodId(null);
        return;
      }

      setPreviewMoodId(moodId);
    },
    [committedMoodId]
  );

  const setPreviewTint = useCallback((moodId: PageMoodId, hue: number) => {
    setPreviewMoodId(null);
    setPreviewTintState({ moodId, hue });
  }, []);

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
    const committedId = resolvePageMoodId(committedMoodId);
    const storedHue =
      committedId != null ? config.theme?.moodTints?.[committedId] : undefined;
    const tintCaughtUp =
      committedTint != null &&
      committedId === committedTint.moodId &&
      typeof storedHue === 'number' &&
      Math.round(storedHue) === Math.round(committedTint.hue);
    const optimisticTint =
      committedTint != null &&
      committedId === committedTint.moodId &&
      !tintCaughtUp
        ? committedTint
        : null;
    const activeTint =
      previewTint != null &&
      activePreview === null &&
      committedId === previewTint.moodId
        ? previewTint
        : null;
    const tintedBase =
      optimisticTint && committedId
        ? resolvePortfolioMoodForTintPreview(
            config,
            committedId,
            optimisticTint.hue
          )
        : resolvedCommitted;
    const isPreviewingMood = activePreview !== null || activeTint !== null;
    const effectiveMood = activePreview
      ? resolvePortfolioMoodForPreview(config, activePreview)
      : activeTint && committedId
        ? resolvePortfolioMoodForTintPreview(
            config,
            committedId,
            activeTint.hue
          )
        : tintedBase;

    return {
      committedMood: resolvedCommitted,
      previewMoodId: activePreview,
      previewTint: activeTint,
      committedTint: optimisticTint,
      effectiveMood,
      isPreviewingMood,
      setPreviewMood,
      setPreviewTint,
      discardMoodPreview,
      commitMoodPreview,
      commitTintPreview,
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
    commitTintPreview,
    committedTint,
    config,
    discardMoodPreview,
    previewTint,
    registerDaoStakeRequest,
    registerMoodSheetOpen,
    registerMoodSheetClose,
    requestCloseMoodSheet,
    requestDaoStake,
    requestOpenMoodSheet,
    resolvedCommitted,
    committedMoodId,
    setPreviewMood,
    setPreviewTint,
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
