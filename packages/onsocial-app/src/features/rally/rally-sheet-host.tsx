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
  RALLY_SEASON_PARAM,
  parsePortfolioSheetParam,
  parseRallySeasonParam,
} from '@/lib/overlay-routes';
import type { RallyRegistryEntry } from '@/lib/rally-season';
import { buildPathWithQuery } from '@/lib/sync-browser-url-query';

type RallySheetContextValue = {
  open: boolean;
  openRallySheet: (seasonId?: string) => void;
  closeRallySheet: () => void;
  occasion: RallyOccasion;
  mark: RallyMarkState;
  player: RallyPlayerState;
  pastSeasons: RallyRegistryEntry[];
  selectSeason: (seasonId: string | null) => void;
  hasSeason: (seasonId: string) => boolean;
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

  const openRallySheet = useCallback(
    (seasonId?: string) => {
      if (seasonId) {
        if (!season.hasSeason(seasonId)) return;
        season.selectSeason(seasonId);
        setOpen(true);
        return;
      }
      if (!season.occasion.entry) return;
      season.selectSeason(null);
      setOpen(true);
    },
    [season]
  );

  const closeRallySheet = useCallback(() => {
    setOpen(false);
  }, []);

  const handleSheetOpenChange = useCallback(
    (next: boolean) => {
      setOpen(next);
      if (!next) season.selectSeason(null);
    },
    [season]
  );

  return (
    <RallySheetContext.Provider
      value={{
        open,
        openRallySheet,
        closeRallySheet,
        occasion: season.occasion,
        mark: season.mark,
        player: season.player,
        pastSeasons: season.pastSeasons,
        selectSeason: season.selectSeason,
        hasSeason: season.hasSeason,
        refresh: season.refresh,
      }}
    >
      {children}
      <PortfolioRallySheet
        open={open}
        player={season.player}
        pastSeasons={season.pastSeasons}
        onSelectSeason={season.selectSeason}
        onOpenChange={handleSheetOpenChange}
      />
    </RallySheetContext.Provider>
  );
}

/** `?sheet=rally` on any surface — viewer player, same key as wallet/boost. */
export function RallySheetDeepLink() {
  const { open, openRallySheet, occasion, hasSeason } = useRallySheet();
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const wanted =
    parsePortfolioSheetParam(searchParams.get(PORTFOLIO_SHEET_PARAM)) ===
    'rally';
  const wantedSeason = parseRallySeasonParam(
    searchParams.get(RALLY_SEASON_PARAM)
  );
  const openedFromUrlRef = useRef(false);
  // URL intent is one-shot — registry refreshes must not re-steer the sheet.
  const handledSeasonRef = useRef<string | null>(null);

  useEffect(() => {
    if (!wanted) handledSeasonRef.current = null;
  }, [wanted]);

  useEffect(() => {
    if (!wanted || !occasion.loaded) return;
    const seasonKey = wantedSeason ?? '';
    if (handledSeasonRef.current === seasonKey) return;
    handledSeasonRef.current = seasonKey;
    if (wantedSeason) {
      if (hasSeason(wantedSeason)) {
        queueMicrotask(() => openRallySheet(wantedSeason));
        return;
      }
      const next = new URLSearchParams(searchParams.toString());
      next.delete(RALLY_SEASON_PARAM);
      router.replace(buildPathWithQuery(pathname, next), { scroll: false });
      return;
    }
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
    queueMicrotask(() => openRallySheet());
  }, [
    hasSeason,
    occasion.entry,
    occasion.loaded,
    openRallySheet,
    pathname,
    router,
    searchParams,
    wanted,
    wantedSeason,
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
    next.delete(RALLY_SEASON_PARAM);
    router.replace(buildPathWithQuery(pathname, next), { scroll: false });
  }, [open, pathname, router, searchParams]);

  return null;
}
