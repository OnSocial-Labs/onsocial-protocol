'use client';

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import {
  PAGE_DRAWER_POST_PEEK,
  type ProfilePostPeek,
} from '@/lib/fetch-profile-peeks';

interface PortfolioPostPeeksContextValue {
  postPeeks: ProfilePostPeek[];
  prependPostPeek: (peek: ProfilePostPeek) => void;
}

const PortfolioPostPeeksContext =
  createContext<PortfolioPostPeeksContextValue | null>(null);

export function PortfolioPostPeeksProvider({
  initialPostPeeks,
  children,
}: {
  initialPostPeeks: ProfilePostPeek[];
  children: ReactNode;
}) {
  const [postPeeks, setPostPeeks] = useState(initialPostPeeks);

  const prependPostPeek = useCallback((peek: ProfilePostPeek) => {
    setPostPeeks((current) => {
      const withoutDup = current.filter(
        (row) =>
          !(row.accountId === peek.accountId && row.postId === peek.postId)
      );
      return [peek, ...withoutDup].slice(0, PAGE_DRAWER_POST_PEEK);
    });
  }, []);

  const value = useMemo(
    () => ({ postPeeks, prependPostPeek }),
    [postPeeks, prependPostPeek]
  );

  return (
    <PortfolioPostPeeksContext.Provider value={value}>
      {children}
    </PortfolioPostPeeksContext.Provider>
  );
}

export function usePortfolioPostPeeks(): PortfolioPostPeeksContextValue {
  const context = useContext(PortfolioPostPeeksContext);
  if (!context) {
    throw new Error(
      'usePortfolioPostPeeks must be used within PortfolioPostPeeksProvider'
    );
  }
  return context;
}

/** Optional read for surfaces that may render outside the provider. */
export function useOptionalPortfolioPostPeeks(): PortfolioPostPeeksContextValue | null {
  return useContext(PortfolioPostPeeksContext);
}
