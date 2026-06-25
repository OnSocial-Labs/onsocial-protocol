'use client';

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type { PageAvatarMode } from '@/lib/page-data';

interface PreviewDraft {
  mode: PageAvatarMode;
  baseline: PageAvatarMode;
}

interface PortfolioFacePreviewContextValue {
  committedAvatarMode: PageAvatarMode;
  previewAvatarMode: PageAvatarMode | null;
  effectiveAvatarMode: PageAvatarMode;
  isPreviewing: boolean;
  setPreviewAvatarMode: (mode: PageAvatarMode) => void;
  discardPreview: () => void;
}

const PortfolioFacePreviewContext =
  createContext<PortfolioFacePreviewContextValue | null>(null);

interface PortfolioFacePreviewProviderProps {
  committedAvatarMode: PageAvatarMode;
  initialAvatarMode: PageAvatarMode;
  children: ReactNode;
}

export function PortfolioFacePreviewProvider({
  committedAvatarMode,
  initialAvatarMode,
  children,
}: PortfolioFacePreviewProviderProps) {
  const [previewDraft, setPreviewDraft] = useState<PreviewDraft | null>(null);

  const activePreview =
    previewDraft?.baseline === committedAvatarMode ? previewDraft : null;

  const discardPreview = useCallback(() => {
    setPreviewDraft(null);
  }, []);

  const setPreviewAvatarMode = useCallback(
    (mode: PageAvatarMode) => {
      if (mode === committedAvatarMode) {
        setPreviewDraft(null);
        return;
      }

      setPreviewDraft({ mode, baseline: committedAvatarMode });
    },
    [committedAvatarMode]
  );

  const value = useMemo<PortfolioFacePreviewContextValue>(() => {
    const previewAvatarMode = activePreview?.mode ?? null;
    const effectiveAvatarMode = previewAvatarMode ?? initialAvatarMode;
    const isPreviewing =
      previewAvatarMode !== null &&
      previewAvatarMode !== committedAvatarMode;

    return {
      committedAvatarMode,
      previewAvatarMode,
      effectiveAvatarMode,
      isPreviewing,
      setPreviewAvatarMode,
      discardPreview,
    };
  }, [
    activePreview,
    committedAvatarMode,
    discardPreview,
    initialAvatarMode,
    setPreviewAvatarMode,
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
