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
import { useRallyMark, type RallyMarkState } from '@/features/rally/use-rally-mark';
import {
  useRallyOccasion,
  type RallyOccasion,
} from '@/features/rally/use-rally-occasion';
import { accountIdsEqual } from '@/lib/account-match';
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
  const occasion = useRallyOccasion();
  const mark = useRallyMark(occasion.entry, occasion.pageTitle, accountId);
  const [open, setOpen] = useState(false);
  const [activeSeasonId, setActiveSeasonId] = useState<string | null>(null);

  const openRallySheet = useCallback(() => {
    if (!occasion.entry) return;
    setActiveSeasonId(occasion.entry.seasonId);
    setOpen(true);
  }, [occasion.entry]);

  const closeRallySheet = useCallback(() => {
    setOpen(false);
  }, []);

  return (
    <RallySheetContext.Provider
      value={{
        open,
        openRallySheet,
        closeRallySheet,
        occasion,
        mark,
      }}
    >
      {children}
      <PortfolioRallySheet
        open={open}
        seasonId={activeSeasonId ?? occasion.seasonId}
        onOpenChange={setOpen}
      />
    </RallySheetContext.Provider>
  );
}

/** Owner-page `?sheet=rally` — same deep-link family as Boost. */
export function RallySheetDeepLink() {
  const { accountId } = useAppWallet();
  const { open, openRallySheet, occasion } = useRallySheet();
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const wanted =
    parsePortfolioSheetParam(searchParams.get(PORTFOLIO_SHEET_PARAM)) ===
    'rally';
  const openedFromUrlRef = useRef(false);
  const ownerPath =
    accountId != null &&
    pathname != null &&
    accountIdsEqual(
      decodePortfolioAccount(pathname) ?? '',
      accountId
    );

  useEffect(() => {
    if (!wanted || !occasion.loaded) return;
    if (!occasion.entry) {
      const next = new URLSearchParams(searchParams.toString());
      if (
        parsePortfolioSheetParam(next.get(PORTFOLIO_SHEET_PARAM)) !== 'rally'
      ) {
        return;
      }
      next.delete(PORTFOLIO_SHEET_PARAM);
      router.replace(buildPathWithQuery(pathname, next), { scroll: false });
      return;
    }
    if (!ownerPath) return;
    queueMicrotask(() => openRallySheet());
  }, [
    occasion.entry,
    occasion.loaded,
    openRallySheet,
    ownerPath,
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

function decodePortfolioAccount(pathname: string): string | null {
  const match = pathname.match(/^\/@([^/]+)/);
  if (!match?.[1]) return null;
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return match[1];
  }
}
