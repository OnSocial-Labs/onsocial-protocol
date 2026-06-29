'use client';

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

interface PageContentDrawerContextValue {
  isOpen: boolean;
  open: () => void;
  close: () => void;
}

const PageContentDrawerContext =
  createContext<PageContentDrawerContextValue | null>(null);

export function PageContentDrawerProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);

  const open = useCallback(() => setIsOpen(true), []);
  const close = useCallback(() => setIsOpen(false), []);

  const value = useMemo(
    () => ({ isOpen, open, close }),
    [close, isOpen, open]
  );

  return (
    <PageContentDrawerContext.Provider value={value}>
      {children}
    </PageContentDrawerContext.Provider>
  );
}

export function usePageContentDrawer(): PageContentDrawerContextValue {
  const context = useContext(PageContentDrawerContext);
  if (!context) {
    throw new Error(
      'usePageContentDrawer must be used within PageContentDrawerProvider'
    );
  }
  return context;
}
