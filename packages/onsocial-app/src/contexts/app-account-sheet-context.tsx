'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { AppAccountSheet } from '@/components/wallet/app-account-sheet';
import { useAppWallet } from '@/contexts/app-wallet-context';
import { APP_SHEET_PARAM, parseAppWalletSheetParam } from '@/lib/app-routes';
import { buildPathWithQuery } from '@/lib/sync-browser-url-query';

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
/** Open the dock wallet from `?sheet=wallet` (Collect push / share). */
export function WalletSheetDeepLink() {
  const { open, openAccountSheet } = useAppAccountSheet();
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const wanted =
    parseAppWalletSheetParam(searchParams.get(APP_SHEET_PARAM)) === 'wallet';
  const openedFromUrlRef = useRef(false);

  useEffect(() => {
    if (!wanted) return;
    queueMicrotask(() => openAccountSheet());
  }, [openAccountSheet, wanted]);

  useEffect(() => {
    if (wanted && open) openedFromUrlRef.current = true;
  }, [open, wanted]);

  useEffect(() => {
    if (open || !openedFromUrlRef.current) return;
    openedFromUrlRef.current = false;
    const next = new URLSearchParams(searchParams.toString());
    if (parseAppWalletSheetParam(next.get(APP_SHEET_PARAM)) !== 'wallet') {
      return;
    }
    next.delete(APP_SHEET_PARAM);
    router.replace(buildPathWithQuery(pathname, next), { scroll: false });
  }, [open, pathname, router, searchParams]);

  return null;
}

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
