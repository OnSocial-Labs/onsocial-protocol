'use client';

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type { ProfileCreatedPeek } from '@/lib/fetch-profile-peeks';
import type { PortfolioHoldingPeek } from '@/lib/portfolio-holdings';
import {
  EMPTY_PROFILE_STORE,
  type ProfileStoreShelf,
} from '@/lib/profile-store-types';

interface PortfolioShelfSnapshot {
  createdPeeks: ProfileCreatedPeek[];
  storeShelf: ProfileStoreShelf;
  holdings: PortfolioHoldingPeek[];
}

interface PortfolioShelfContextValue extends PortfolioShelfSnapshot {
  hydrateShelf: (next: Partial<PortfolioShelfSnapshot>) => void;
}

const PortfolioShelfContext = createContext<PortfolioShelfContextValue | null>(
  null
);

export function PortfolioShelfProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [createdPeeks, setCreatedPeeks] = useState<ProfileCreatedPeek[]>([]);
  const [storeShelf, setStoreShelf] =
    useState<ProfileStoreShelf>(EMPTY_PROFILE_STORE);
  const [holdings, setHoldings] = useState<PortfolioHoldingPeek[]>([]);

  const hydrateShelf = useCallback((next: Partial<PortfolioShelfSnapshot>) => {
    if (next.createdPeeks) {
      setCreatedPeeks(next.createdPeeks);
    }
    if (next.storeShelf) {
      setStoreShelf(next.storeShelf);
    }
    if (next.holdings) {
      setHoldings(next.holdings);
    }
  }, []);

  const value = useMemo(
    () => ({ createdPeeks, storeShelf, holdings, hydrateShelf }),
    [createdPeeks, holdings, hydrateShelf, storeShelf]
  );

  return (
    <PortfolioShelfContext.Provider value={value}>
      {children}
    </PortfolioShelfContext.Provider>
  );
}

export function usePortfolioShelf(): Pick<
  PortfolioShelfContextValue,
  'createdPeeks' | 'storeShelf' | 'holdings'
> {
  const context = useContext(PortfolioShelfContext);
  if (!context) {
    throw new Error(
      'usePortfolioShelf must be used within PortfolioShelfProvider'
    );
  }
  return {
    createdPeeks: context.createdPeeks,
    storeShelf: context.storeShelf,
    holdings: context.holdings,
  };
}

export function usePortfolioShelfHydrate(): PortfolioShelfContextValue['hydrateShelf'] {
  const context = useContext(PortfolioShelfContext);
  if (!context) {
    throw new Error(
      'usePortfolioShelfHydrate must be used within PortfolioShelfProvider'
    );
  }
  return context.hydrateShelf;
}
