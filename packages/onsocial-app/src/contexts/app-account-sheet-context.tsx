'use client';

import {
  createContext,
  useCallback,
  useContext,
  useState,
  type ReactNode,
} from 'react';
import { AppAccountSheet } from '@/components/wallet/app-account-sheet';
import { useAppWallet } from '@/contexts/app-wallet-context';

interface AppAccountSheetContextValue {
  open: boolean;
  pageAccountId?: string;
  openAccountSheet: (options?: { pageAccountId?: string }) => void;
  closeAccountSheet: () => void;
}

const AppAccountSheetContext = createContext<AppAccountSheetContextValue>({
  open: false,
  pageAccountId: undefined,
  openAccountSheet: () => {},
  closeAccountSheet: () => {},
});

export function useAppAccountSheet() {
  return useContext(AppAccountSheetContext);
}

/** Mount inside AppRewardsProvider + ViewerProfileShellProvider (see app-providers). */
export function AppAccountSheetHost() {
  const { accountId } = useAppWallet();
  const { open, pageAccountId, closeAccountSheet } = useAppAccountSheet();

  if (!accountId) {
    return null;
  }

  return (
    <AppAccountSheet
      open={open}
      onClose={closeAccountSheet}
      pageAccountId={pageAccountId}
    />
  );
}

export function AppAccountSheetProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [pageAccountId, setPageAccountId] = useState<string | undefined>();

  const openAccountSheet = useCallback(
    (options?: { pageAccountId?: string }) => {
      setPageAccountId(options?.pageAccountId);
      setOpen(true);
    },
    []
  );

  const closeAccountSheet = useCallback(() => {
    setOpen(false);
  }, []);

  return (
    <AppAccountSheetContext.Provider
      value={{ open, pageAccountId, openAccountSheet, closeAccountSheet }}
    >
      {children}
    </AppAccountSheetContext.Provider>
  );
}
