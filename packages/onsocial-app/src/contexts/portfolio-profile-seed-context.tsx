'use client';

import {
  createContext,
  useCallback,
  useContext,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

export interface PortfolioProfileSeedData {
  accountId: string;
  displayName: string;
  avatarUrl: string | null;
  counts: {
    incoming: number;
    outgoing: number;
    mutual: number;
  };
}

interface PortfolioProfileSeedContextValue {
  seed: PortfolioProfileSeedData | null;
  writeSeed: (seed: PortfolioProfileSeedData) => void;
  commitSeed: (seed: PortfolioProfileSeedData) => void;
  readSeed: (accountId: string) => PortfolioProfileSeedData | null;
  unregisterSeed: (accountId: string) => void;
}

const PortfolioProfileSeedContext =
  createContext<PortfolioProfileSeedContextValue | null>(null);

function seedsEqual(
  current: PortfolioProfileSeedData | null,
  next: PortfolioProfileSeedData
): boolean {
  if (!current) {
    return false;
  }

  return (
    current.accountId === next.accountId &&
    current.displayName === next.displayName &&
    current.avatarUrl === next.avatarUrl &&
    current.counts.incoming === next.counts.incoming &&
    current.counts.outgoing === next.counts.outgoing &&
    current.counts.mutual === next.counts.mutual
  );
}

export function PortfolioProfileSeedProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [seed, setSeed] = useState<PortfolioProfileSeedData | null>(null);
  const syncSeedRef = useRef<Map<string, PortfolioProfileSeedData>>(new Map());

  const writeSeed = useCallback((next: PortfolioProfileSeedData) => {
    syncSeedRef.current.set(next.accountId, next);
  }, []);

  const commitSeed = useCallback((next: PortfolioProfileSeedData) => {
    setSeed((current) => (seedsEqual(current, next) ? current : next));
  }, []);

  const readSeed = useCallback((accountId: string) => {
    return syncSeedRef.current.get(accountId) ?? null;
  }, []);

  const unregisterSeed = useCallback((accountId: string) => {
    syncSeedRef.current.delete(accountId);
    setSeed((current) => (current?.accountId === accountId ? null : current));
  }, []);

  const value = useMemo(
    () => ({ seed, writeSeed, commitSeed, readSeed, unregisterSeed }),
    [commitSeed, readSeed, seed, unregisterSeed, writeSeed]
  );

  return (
    <PortfolioProfileSeedContext.Provider value={value}>
      {children}
    </PortfolioProfileSeedContext.Provider>
  );
}

export function PortfolioProfileSeed({
  accountId,
  displayName,
  avatarUrl,
  counts,
}: PortfolioProfileSeedData) {
  const context = useContext(PortfolioProfileSeedContext);
  const writeSeed = context?.writeSeed;
  const commitSeed = context?.commitSeed;
  const unregisterSeed = context?.unregisterSeed;

  const data = useMemo(
    () => ({
      accountId,
      displayName,
      avatarUrl,
      counts,
    }),
    [
      accountId,
      avatarUrl,
      counts,
      displayName,
    ]
  );

  if (writeSeed) {
    writeSeed(data);
  }

  useLayoutEffect(() => {
    commitSeed?.(data);
  }, [commitSeed, data]);

  useLayoutEffect(() => {
    if (!unregisterSeed) {
      return;
    }

    return () => unregisterSeed(accountId);
  }, [accountId, unregisterSeed]);

  return null;
}

export function usePortfolioProfileSeed(
  accountId: string
): PortfolioProfileSeedData | null {
  const context = useContext(PortfolioProfileSeedContext);
  if (!context) {
    return null;
  }

  const synced = context.readSeed(accountId);
  if (synced) {
    return synced;
  }

  return context.seed?.accountId === accountId ? context.seed : null;
}
