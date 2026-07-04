'use client';

import {
  createContext,
  useContext,
  useMemo,
  type ReactNode,
} from 'react';
import { useAppWallet } from '@/contexts/app-wallet-context';
import { useViewerProfileShell } from '@/hooks/use-viewer-profile-shell';

interface ViewerProfileShellContextValue {
  avatarUrl: string | null;
  displayName?: string;
  isLoading: boolean;
  patchShell: (patch: { displayName?: string; avatarUrl?: string | null }) => void;
}

const ViewerProfileShellContext =
  createContext<ViewerProfileShellContextValue | null>(null);

export function ViewerProfileShellProvider({ children }: { children: ReactNode }) {
  const { accountId } = useAppWallet();
  const { avatarUrl, displayName, isLoading, patchShell } = useViewerProfileShell(accountId);

  const value = useMemo(
    () => ({ avatarUrl, displayName, isLoading, patchShell }),
    [avatarUrl, displayName, isLoading, patchShell]
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
