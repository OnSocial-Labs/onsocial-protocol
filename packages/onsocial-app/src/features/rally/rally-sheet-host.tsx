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
import { useAppWallet } from '@/contexts/app-wallet-context';
import { PortfolioRallySheet } from '@/features/rally/portfolio-rally-sheet';
import {
  useRallySeason,
  type RallyMarkState,
  type RallyOccasion,
  type RallyPlayerState,
} from '@/features/rally/use-rally-season';
import {
  PORTFOLIO_SHEET_PARAM,
  parsePortfolioSheetParam,
} from '@/lib/overlay-routes';
import { buildPathWithQuery } from '@/lib/sync-browser-url-query';

type RallySheetContextValue = {
  open: boolean;
  openRallySheet: () => void;
  closeRallySheet: () => void;
  occasion: RallyOccasion;
  mark: RallyMarkState;
  player: RallyPlayerState;
  refresh: () => void;
};

const RallySheetContext = createContext<RallySheetContextValue | null>(null);

export function useRallySheet(): RallySheetContextValue {
  const context = useContext(RallySheetContext);
  if (!context) {
    throw new Error('useRallySheet must be used within RallySheetProvider');
  }
  return context;
}

export function useRallySheetOptional(): RallySheetContextValue | null {
  return useContext(RallySheetContext);
}

export function RallySheetProvider({ children }: { children: ReactNode }) {
  const { accountId } = useAppWallet();
  const [open, setOpen] = useState(false);
  const season = useRallySeason(accountId, open);

  const openRallySheet = useCallback(() => {
    if (!season.occasion.entry) return;
    setOpen(true);
  }, [season.occasion.entry]);

  const closeRallySheet = useCallback(() => {
    setOpen(false);
  }, []);

  return (
    <RallySheetContext.Provider
      value={{
        open,
        openRallySheet,
        closeRallySheet,
        occasion: season.occasion,
        mark: season.mark,
        player: season.player,
        refresh: season.refresh,
      }}
    >
      {children}
      <PortfolioRallySheet
        open={open}
        player={season.player}
        onOpenChange={setOpen}
      />
    </RallySheetContext.Provider>
  );
}

/** `?sheet=rally` on any surface — viewer player, same key as wallet/boost. */
export function RallySheetDeepLink() {
  const { open, openRallySheet, occasion } = useRallySheet();
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const wanted =
    parsePortfolioSheetParam(searchParams.get(PORTFOLIO_SHEET_PARAM)) ===
    'rally';
  const openedFromUrlRef = useRef(false);

  useEffect(() => {
    if (!wanted || !occasion.loaded) return;
    if (!occasion.entry) {
      const next = new URLSearchParams(searchParams.toString());
      if (parsePortfolioSheetParam(next.get(PORTFOLIO_SHEET_PARAM)) !== 'rally') {
        return;
      }
      next.delete(PORTFOLIO_SHEET_PARAM);
      router.replace(buildPathWithQuery(pathname, next), { scroll: false });
      return;
    }
    queueMicrotask(() => openRallySheet());
  }, [
    occasion.entry,
    occasion.loaded,
    openRallySheet,
    pathname,
    router,
    searchParams,
    wanted,
  ]);

  useEffect(() => {
    if (wanted && open) openedFromUrlRef.current = true;
  }, [open, wanted]);

  useEffect(() => {
    if (open || !openedFromUrlRef.current) return;
    openedFromUrlRef.current = false;
    const next = new URLSearchParams(searchParams.toString());
    if (parsePortfolioSheetParam(next.get(PORTFOLIO_SHEET_PARAM)) !== 'rally') {
      return;
    }
    next.delete(PORTFOLIO_SHEET_PARAM);
    router.replace(buildPathWithQuery(pathname, next), { scroll: false });
  }, [open, pathname, router, searchParams]);

  return null;
}
