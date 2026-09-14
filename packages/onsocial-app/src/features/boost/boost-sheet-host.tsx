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
import { PortfolioBoostSheet } from '@/features/boost/portfolio-boost-sheet';
import { useBoostPosition } from '@/features/boost/use-boost-position';
import { useAppWallet } from '@/contexts/app-wallet-context';
import {
  PORTFOLIO_SHEET_PARAM,
  parsePortfolioSheetParam,
} from '@/lib/overlay-routes';
import { buildPathWithQuery } from '@/lib/sync-browser-url-query';

type BoostSheetContextValue = {
  open: boolean;
  openBoostSheet: () => void;
  closeBoostSheet: () => void;
};

const BoostSheetContext = createContext<BoostSheetContextValue | null>(null);

export function useBoostSheet(): BoostSheetContextValue {
  const context = useContext(BoostSheetContext);
  if (!context) {
    throw new Error('useBoostSheet must be used within BoostSheetProvider');
  }
  return context;
}

export function BoostSheetProvider({ children }: { children: ReactNode }) {
  const { accountId } = useAppWallet();
  const [open, setOpen] = useState(false);
  const position = useBoostPosition(accountId ?? '', { live: open });

  const openBoostSheet = useCallback(() => {
    setOpen(true);
  }, []);

  const closeBoostSheet = useCallback(() => {
    setOpen(false);
  }, []);

  return (
    <BoostSheetContext.Provider
      value={{ open, openBoostSheet, closeBoostSheet }}
    >
      {children}
      <PortfolioBoostSheet
        open={open}
        accountId={accountId ?? ''}
        position={position}
        onOpenChange={setOpen}
      />
    </BoostSheetContext.Provider>
  );
}

/** `?sheet=boost` on Home, gate, or profile — owner sheet, same key as Rally. */
export function BoostSheetDeepLink() {
  const { open, openBoostSheet } = useBoostSheet();
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const wanted =
    parsePortfolioSheetParam(searchParams.get(PORTFOLIO_SHEET_PARAM)) ===
    'boost';
  const openedFromUrlRef = useRef(false);

  useEffect(() => {
    if (!wanted) return;
    queueMicrotask(() => openBoostSheet());
  }, [openBoostSheet, wanted]);

  useEffect(() => {
    if (wanted && open) openedFromUrlRef.current = true;
  }, [open, wanted]);

  useEffect(() => {
    if (open || !openedFromUrlRef.current) return;
    openedFromUrlRef.current = false;
    const next = new URLSearchParams(searchParams.toString());
    if (parsePortfolioSheetParam(next.get(PORTFOLIO_SHEET_PARAM)) !== 'boost') {
      return;
    }
    next.delete(PORTFOLIO_SHEET_PARAM);
    router.replace(buildPathWithQuery(pathname, next), { scroll: false });
  }, [open, pathname, router, searchParams]);

  return null;
}
