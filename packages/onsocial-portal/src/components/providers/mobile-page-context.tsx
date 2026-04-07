'use client';

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { usePathname } from 'next/navigation';
import type { PortalAccent } from '@/lib/portal-colors';

interface MobilePageBadgeState {
  key: string;
  badge: ReactNode;
  badgeAccent: PortalAccent;
}

interface NavBackState {
  label: string;
}

interface MobilePageContextValue {
  pageBadge: MobilePageBadgeState | null;
  handoffProgress: number;
  navBack: NavBackState | null;
  setPageBadge: (badge: MobilePageBadgeState) => void;
  clearPageBadge: (key: string) => void;
  setHandoffProgress: (progress: number) => void;
  setNavBack: (state: NavBackState | null) => void;
}

const MobilePageContext = createContext<MobilePageContextValue | null>(null);

type RoutedBadgeState = {
  pathname: string;
  badge: MobilePageBadgeState;
} | null;

type RoutedProgressState = {
  pathname: string;
  progress: number;
} | null;

export function MobilePageProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [pageBadgeState, setPageBadgeState] = useState<RoutedBadgeState>(null);
  const [handoffProgressState, setHandoffProgressState] =
    useState<RoutedProgressState>(null);
  const [navBackState, setNavBackState] = useState<{
    pathname: string;
    state: NavBackState;
  } | null>(null);
  const navBack =
    navBackState?.pathname === pathname ? navBackState.state : null;
  const pageBadge =
    pageBadgeState?.pathname === pathname ? pageBadgeState.badge : null;
  const handoffProgress =
    handoffProgressState?.pathname === pathname
      ? handoffProgressState.progress
      : 0;

  const setPageBadge = useCallback(
    (badge: MobilePageBadgeState) => {
      setPageBadgeState({ pathname, badge });
    },
    [pathname]
  );

  const clearPageBadge = useCallback(
    (key: string) => {
      setPageBadgeState((current) =>
        current?.pathname === pathname && current.badge.key === key
          ? null
          : current
      );
    },
    [pathname]
  );

  const setHandoffProgress = useCallback(
    (progress: number) => {
      setHandoffProgressState({
        pathname,
        progress: Math.max(0, Math.min(1, progress)),
      });
    },
    [pathname]
  );

  const setNavBack = useCallback(
    (state: NavBackState | null) => {
      setNavBackState(state ? { pathname, state } : null);
    },
    [pathname]
  );

  const value = useMemo(
    () => ({
      pageBadge,
      handoffProgress,
      navBack,
      setPageBadge,
      clearPageBadge,
      setHandoffProgress,
      setNavBack,
    }),
    [
      clearPageBadge,
      handoffProgress,
      navBack,
      pageBadge,
      setHandoffProgress,
      setNavBack,
      setPageBadge,
    ]
  );

  return (
    <MobilePageContext.Provider value={value}>
      {children}
    </MobilePageContext.Provider>
  );
}

export function useMobilePageContext() {
  const context = useContext(MobilePageContext);

  if (!context) {
    throw new Error(
      'useMobilePageContext must be used within MobilePageProvider'
    );
  }

  return context;
}
