'use client';

import {
  createContext,
  useContext,
  useMemo,
  type ReactNode,
} from 'react';
import type { ProfileKind } from '@onsocial/sdk';
import { useAppWallet } from '@/contexts/app-wallet-context';
import { useViewerProfileShell } from '@/hooks/use-viewer-profile-shell';

interface ViewerProfileShellContextValue {
  avatarUrl: string | null;
  displayName?: string;
  kind?: ProfileKind | null;
  isLoading: boolean;
  patchShell: (patch: {
    displayName?: string;
    avatarUrl?: string | null;
    kind?: ProfileKind | null;
  }) => void;
}

const ViewerProfileShellContext =
  createContext<ViewerProfileShellContextValue | null>(null);

export function ViewerProfileShellProvider({ children }: { children: ReactNode }) {
  const { accountId } = useAppWallet();
  const { avatarUrl, displayName, kind, isLoading, patchShell } =
    useViewerProfileShell(accountId);

  const value = useMemo(
    () => ({ avatarUrl, displayName, kind, isLoading, patchShell }),
    [avatarUrl, displayName, kind, isLoading, patchShell]
  );

  return (
    <ViewerProfileShellContext.Provider value={value}>
      {children}
    </ViewerProfileShellContext.Provider>
  );
}

export function useViewerProfileShellContext() {
  return useContext(ViewerProfileShellContext);
}
