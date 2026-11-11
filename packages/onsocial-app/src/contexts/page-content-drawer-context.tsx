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
  /** True from the close request until the sheet finishes leaving. */
  closing: boolean;
  open: () => void;
  /** Sheet open becomes false. The focus trap releases on the following frame. */
  beginClose: () => void;
  close: () => void;
  /** Drawer body scroller — dock auto-hide listens here while the sheet is open. */
  scrollNode: HTMLDivElement | null;
  setScrollNode: (node: HTMLDivElement | null) => void;
}

const PageContentDrawerContext =
  createContext<PageContentDrawerContextValue | null>(null);

export function PageContentDrawerProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const [closing, setClosing] = useState(false);
  const [scrollNode, setScrollNodeState] = useState<HTMLDivElement | null>(
    null
  );

  const open = useCallback(() => {
    setClosing(false);
    setIsOpen(true);
  }, []);
  const beginClose = useCallback(() => setClosing(true), []);
  const close = useCallback(() => {
    setClosing(false);
    setIsOpen(false);
  }, []);
  const setScrollNode = useCallback((node: HTMLDivElement | null) => {
    setScrollNodeState(node);
  }, []);

  const value = useMemo(
    () => ({ isOpen, closing, open, beginClose, close, scrollNode, setScrollNode }),
    [beginClose, close, closing, isOpen, open, scrollNode, setScrollNode]
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
