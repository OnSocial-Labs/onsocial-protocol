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
  /** Drawer body scroller — dock auto-hide listens here while the sheet is open. */
  scrollNode: HTMLDivElement | null;
  setScrollNode: (node: HTMLDivElement | null) => void;
}

const PageContentDrawerContext =
  createContext<PageContentDrawerContextValue | null>(null);

export function PageContentDrawerProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const [scrollNode, setScrollNodeState] = useState<HTMLDivElement | null>(
    null
  );

  const open = useCallback(() => setIsOpen(true), []);
  const close = useCallback(() => setIsOpen(false), []);
  const setScrollNode = useCallback((node: HTMLDivElement | null) => {
    setScrollNodeState(node);
  }, []);

  const value = useMemo(
    () => ({ isOpen, open, close, scrollNode, setScrollNode }),
    [close, isOpen, open, scrollNode, setScrollNode]
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
