'use client';

import {
  createContext,
  useContext,
  type ReactNode,
  type RefObject,
} from 'react';
import type { MarketAudioFormatFilter } from '@/features/market/market-facet-rail';
import type { MarketMediumFilter } from '@/features/market/market-medium';
import type { DropFacetMedium } from '@/features/scarces/drop-facets';

export interface CollectiblesPanelChromeContextValue {
  pageAccountId: string | null;
  scrollRootRef: RefObject<HTMLElement | null>;
  searchQuery: string;
  setSearchQuery: (next: string) => void;
  showDiscoveryChrome: boolean;
  mediumFilter: MarketMediumFilter;
  setMediumFilter: (next: MarketMediumFilter) => void;
  facetMedium: DropFacetMedium | null;
  selectedFacets: string[];
  audioFormatFilter: MarketAudioFormatFilter;
  replaceDiscoveryParams: (next: {
    facets?: string[];
    audioFormat?: MarketAudioFormatFilter;
  }) => void;
}

const CollectiblesPanelChromeContext =
  createContext<CollectiblesPanelChromeContextValue | null>(null);

export function CollectiblesPanelChromeProvider({
  value,
  children,
}: {
  value: CollectiblesPanelChromeContextValue;
  children: ReactNode;
}) {
  return (
    <CollectiblesPanelChromeContext.Provider value={value}>
      {children}
    </CollectiblesPanelChromeContext.Provider>
  );
}

export function useCollectiblesPanelChrome(): CollectiblesPanelChromeContextValue {
  const value = useContext(CollectiblesPanelChromeContext);
  if (!value) {
    throw new Error(
      'Collectibles chrome must render inside CollectiblesPanelChromeProvider.'
    );
  }
  return value;
}
