'use client';

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type { PageDrawerMeta } from '@/lib/page-drawer-meta';
import type { ProfileGuildSummary } from '@/lib/profile-guilds';

interface PortfolioDrawerData {
  drawerMeta: PageDrawerMeta;
  guilds: ProfileGuildSummary[];
}

const PortfolioDrawerDataContext = createContext<PortfolioDrawerData | null>(
  null
);
const PortfolioDrawerDataHydrateContext = createContext<
  ((next: PortfolioDrawerData) => void) | null
>(null);

/**
 * Drawer meta + guilds stay off the SSR hero-critical path. The server seeds a
 * cheap meta (name + stat counts); the streamed shelf hydrates joined/updated
 * timestamps, scarce mints, and guild rows once they resolve.
 */
export function PortfolioDrawerDataProvider({
  initialDrawerMeta,
  initialGuilds,
  children,
}: {
  initialDrawerMeta: PageDrawerMeta;
  initialGuilds: ProfileGuildSummary[];
  children: ReactNode;
}) {
  const [streamed, setStreamed] = useState<PortfolioDrawerData | null>(null);
  const hydrate = useCallback((next: PortfolioDrawerData) => {
    setStreamed(next);
  }, []);
  const value = useMemo(
    () => streamed ?? { drawerMeta: initialDrawerMeta, guilds: initialGuilds },
    [initialDrawerMeta, initialGuilds, streamed]
  );

  return (
    <PortfolioDrawerDataContext.Provider value={value}>
      <PortfolioDrawerDataHydrateContext.Provider value={hydrate}>
        {children}
      </PortfolioDrawerDataHydrateContext.Provider>
    </PortfolioDrawerDataContext.Provider>
  );
}

export function usePortfolioDrawerData(): PortfolioDrawerData {
  const value = useContext(PortfolioDrawerDataContext);
  if (!value) {
    throw new Error(
      'usePortfolioDrawerData requires PortfolioDrawerDataProvider'
    );
  }
  return value;
}

export function usePortfolioDrawerDataHydrate(): (
  next: PortfolioDrawerData
) => void {
  const hydrate = useContext(PortfolioDrawerDataHydrateContext);
  if (!hydrate) {
    throw new Error(
      'usePortfolioDrawerDataHydrate requires PortfolioDrawerDataProvider'
    );
  }
  return hydrate;
}
