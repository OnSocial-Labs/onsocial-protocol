'use client';

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type { PageAvatarMode, PageHeroSource } from '@/lib/page-data';

interface PreviewDraft {
  avatarMode: PageAvatarMode;
  heroSource: PageHeroSource;
  baselineAvatarMode: PageAvatarMode;
  baselineHeroSource: PageHeroSource;
}

interface PortfolioFacePreviewContextValue {
  committedAvatarMode: PageAvatarMode;
  committedHeroSource: PageHeroSource;
  previewAvatarMode: PageAvatarMode | null;
  previewHeroSource: PageHeroSource | null;
  effectiveAvatarMode: PageAvatarMode;
  effectiveHeroSource: PageHeroSource;
  isPreviewing: boolean;
  isPreviewingLayout: boolean;
  isPreviewingHeroSource: boolean;
  setPreviewAvatarMode: (mode: PageAvatarMode) => void;
  setPreviewHeroSource: (source: PageHeroSource) => void;
  discardPreview: () => void;
}

const PortfolioFacePreviewContext =
  createContext<PortfolioFacePreviewContextValue | null>(null);

interface PortfolioFacePreviewProviderProps {
  committedAvatarMode: PageAvatarMode;
  committedHeroSource: PageHeroSource;
  initialAvatarMode: PageAvatarMode;
  children: ReactNode;
}

export function PortfolioFacePreviewProvider({
  committedAvatarMode,
  committedHeroSource,
  initialAvatarMode,
  children,
}: PortfolioFacePreviewProviderProps) {
  const [previewDraft, setPreviewDraft] = useState<PreviewDraft | null>(null);

  const activePreview =
    previewDraft?.baselineAvatarMode === committedAvatarMode &&
    previewDraft?.baselineHeroSource === committedHeroSource
      ? previewDraft
      : null;

  const upsertPreview = useCallback(
    (next: { avatarMode: PageAvatarMode; heroSource: PageHeroSource }) => {
      if (
        next.avatarMode === committedAvatarMode &&
        next.heroSource === committedHeroSource
      ) {
        setPreviewDraft(null);
        return;
      }

      setPreviewDraft({
        avatarMode: next.avatarMode,
        heroSource: next.heroSource,
        baselineAvatarMode: committedAvatarMode,
        baselineHeroSource: committedHeroSource,
      });
    },
    [committedAvatarMode, committedHeroSource]
  );

  const discardPreview = useCallback(() => {
    setPreviewDraft(null);
  }, []);

  const setPreviewAvatarMode = useCallback(
    (mode: PageAvatarMode) => {
      const heroSource = activePreview?.heroSource ?? committedHeroSource;

      upsertPreview({ avatarMode: mode, heroSource });
    },
    [activePreview, committedHeroSource, upsertPreview]
  );

  const setPreviewHeroSource = useCallback(
    (source: PageHeroSource) => {
      const avatarMode = activePreview?.avatarMode ?? committedAvatarMode;
      upsertPreview({ avatarMode, heroSource: source });
    },
    [activePreview, committedAvatarMode, upsertPreview]
  );

  const value = useMemo<PortfolioFacePreviewContextValue>(() => {
    const previewAvatarMode = activePreview?.avatarMode ?? null;
    const previewHeroSource = activePreview?.heroSource ?? null;
    const effectiveAvatarMode = previewAvatarMode ?? initialAvatarMode;
    const effectiveHeroSource = previewHeroSource ?? committedHeroSource;
    const isPreviewingLayout =
      previewAvatarMode !== null &&
      previewAvatarMode !== committedAvatarMode;
    const isPreviewingHeroSource =
      previewHeroSource !== null &&
      previewHeroSource !== committedHeroSource;
    const isPreviewing = isPreviewingLayout || isPreviewingHeroSource;

    return {
      committedAvatarMode,
      committedHeroSource,
      previewAvatarMode,
      previewHeroSource,
      effectiveAvatarMode,
      effectiveHeroSource,
      isPreviewing,
      isPreviewingLayout,
      isPreviewingHeroSource,
      setPreviewAvatarMode,
      setPreviewHeroSource,
      discardPreview,
    };
  }, [
    activePreview,
    committedAvatarMode,
    committedHeroSource,
    discardPreview,
    initialAvatarMode,
    setPreviewAvatarMode,
    setPreviewHeroSource,
  ]);

  return (
    <PortfolioFacePreviewContext.Provider value={value}>
      {children}
    </PortfolioFacePreviewContext.Provider>
  );
}

export function usePortfolioFacePreview(): PortfolioFacePreviewContextValue {
  const context = useContext(PortfolioFacePreviewContext);
  if (!context) {
    throw new Error(
      'usePortfolioFacePreview must be used within PortfolioFacePreviewProvider'
    );
  }
  return context;
}
