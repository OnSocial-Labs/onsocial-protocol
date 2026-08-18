'use client';

import {
  createContext,
  useContext,
  type ReactNode,
  type RefObject,
} from 'react';
import { useDiscoverProfiles } from '@/hooks/use-discover-profiles';
import type { GuildSummaryCardModel } from '@/features/guilds/guild-summary-card';
import type { DiscoverProfilesResponse } from '@/lib/discover-profiles';
import type { DiscoverTrendingSeed } from '@/lib/discover-trending-server';

export type DiscoverShellVariant = 'overlay' | 'page';

type DiscoverPanelContextValue = ReturnType<typeof useDiscoverProfiles> & {
  shellVariant: DiscoverShellVariant;
  scrollRootRef?: RefObject<Element | null>;
  initialTrending: DiscoverTrendingSeed | null;
  initialGuilds: GuildSummaryCardModel[] | null;
};

const DiscoverPanelContext = createContext<DiscoverPanelContextValue | null>(
  null
);

export function DiscoverPanelProvider({
  shellVariant,
  scrollRootRef,
  initialPage = null,
  initialTrending = null,
  initialGuilds = null,
  children,
}: {
  shellVariant: DiscoverShellVariant;
  scrollRootRef?: RefObject<Element | null>;
  initialPage?: DiscoverProfilesResponse | null;
  initialTrending?: DiscoverTrendingSeed | null;
  initialGuilds?: GuildSummaryCardModel[] | null;
  children: ReactNode;
}) {
  const discover = useDiscoverProfiles(scrollRootRef, { initialPage });

  return (
    <DiscoverPanelContext.Provider
      value={{
        ...discover,
        shellVariant,
        scrollRootRef,
        initialTrending,
        initialGuilds,
      }}
    >
      {children}
    </DiscoverPanelContext.Provider>
  );
}

export function useDiscoverPanel(): DiscoverPanelContextValue {
  const context = useContext(DiscoverPanelContext);
  if (!context) {
    throw new Error('useDiscoverPanel must be used within DiscoverPanelProvider');
  }
  return context;
}
