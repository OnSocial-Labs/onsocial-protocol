'use client';

import {
  createContext,
  useContext,
  type ReactNode,
  type RefObject,
} from 'react';
import { useDiscoverProfiles } from '@/hooks/use-discover-profiles';
import type { DiscoverProfilesResponse } from '@/lib/discover-profiles';

export type DiscoverShellVariant = 'overlay' | 'page';

type DiscoverPanelContextValue = ReturnType<typeof useDiscoverProfiles> & {
  shellVariant: DiscoverShellVariant;
};

const DiscoverPanelContext = createContext<DiscoverPanelContextValue | null>(
  null
);

export function DiscoverPanelProvider({
  shellVariant,
  scrollRootRef,
  initialPage = null,
  children,
}: {
  shellVariant: DiscoverShellVariant;
  scrollRootRef?: RefObject<Element | null>;
  initialPage?: DiscoverProfilesResponse | null;
  children: ReactNode;
}) {
  const discover = useDiscoverProfiles(scrollRootRef, { initialPage });

  return (
    <DiscoverPanelContext.Provider value={{ ...discover, shellVariant }}>
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
