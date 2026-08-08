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
import {
  EMPTY_PROFILE_STORE,
  type ProfileStoreShelf,
} from '@/lib/profile-store-types';

interface PortfolioShelfContextValue {
  createdPeeks: ProfileCreatedPeek[];
  storeShelf: ProfileStoreShelf;
  hydrateShelf: (next: {
    createdPeeks: ProfileCreatedPeek[];
    storeShelf: ProfileStoreShelf;
  }) => void;
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

  const hydrateShelf = useCallback(
    (next: {
      createdPeeks: ProfileCreatedPeek[];
      storeShelf: ProfileStoreShelf;
    }) => {
      setCreatedPeeks(next.createdPeeks);
      setStoreShelf(next.storeShelf);
    },
    []
  );

  const value = useMemo(
    () => ({ createdPeeks, storeShelf, hydrateShelf }),
    [createdPeeks, hydrateShelf, storeShelf]
  );

  return (
    <PortfolioShelfContext.Provider value={value}>
      {children}
    </PortfolioShelfContext.Provider>
  );
}

export function usePortfolioShelf(): Pick<
  PortfolioShelfContextValue,
  'createdPeeks' | 'storeShelf'
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
