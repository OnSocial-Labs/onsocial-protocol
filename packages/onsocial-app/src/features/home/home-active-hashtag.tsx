'use client';

import { createContext, useContext, type ReactNode } from 'react';

const HomeActiveHashtagContext = createContext<string | null>(null);

/** Supplies the Home `?tag=` filter so post bodies can bold matching #tags. */
export function HomeActiveHashtagProvider({
  tag,
  children,
}: {
  tag: string | null;
  children: ReactNode;
}) {
  return (
    <HomeActiveHashtagContext.Provider value={tag}>
      {children}
    </HomeActiveHashtagContext.Provider>
  );
}

export function useHomeActiveHashtag(): string | null {
  return useContext(HomeActiveHashtagContext);
}
