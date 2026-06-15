'use client';

import { useCallback, useEffect, useState } from 'react';

export type SeasonPhase = 'live' | 'upcoming' | 'claim' | 'archived';

export interface SeasonRegistryEntry {
  seasonId: string;
  label: string;
  active: boolean;
  phase: SeasonPhase;
  starts_at_ns: string;
  ends_at_ns: string;
  claim_starts_at_ns: string | null;
  is_live: boolean;
  claim_open: boolean;
  rallyPath: string;
}

export interface SeasonRegistrySnapshot {
  live: SeasonRegistryEntry | null;
  seasons: SeasonRegistryEntry[];
  resolvedActiveSeasonId: string | null;
}

interface SeasonRegistryResponse extends SeasonRegistrySnapshot {
  success?: boolean;
  error?: string;
}

const REGISTRY_REFRESH_MS = 60_000;

export async function fetchSeasonRegistry(): Promise<SeasonRegistrySnapshot | null> {
  const response = await fetch('/api/seasons/registry', {
    cache: 'no-store',
  });
  if (!response.ok) {
    return null;
  }

  const data = (await response.json()) as SeasonRegistryResponse;
  if (!Array.isArray(data.seasons)) {
    return null;
  }

  return {
    live: data.live ?? null,
    seasons: data.seasons,
    resolvedActiveSeasonId:
      data.resolvedActiveSeasonId ?? data.live?.seasonId ?? null,
  };
}

export function useSeasonRegistry(options?: { enabled?: boolean }) {
  const enabled = options?.enabled ?? true;
  const [registry, setRegistry] = useState<SeasonRegistrySnapshot | null>(null);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!enabled) {
      return;
    }

    setLoading(true);
    try {
      const next = await fetchSeasonRegistry();
      if (!next) {
        setError('Season registry unavailable');
        return;
      }
      setRegistry(next);
      setError(null);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Season registry unavailable'
      );
    } finally {
      setLoading(false);
    }
  }, [enabled]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    const interval = window.setInterval(() => {
      void refresh();
    }, REGISTRY_REFRESH_MS);

    return () => window.clearInterval(interval);
  }, [enabled, refresh]);

  return {
    registry,
    loading,
    error,
    refresh,
  };
}

export function listArchiveSeasons(
  registry: SeasonRegistrySnapshot | null,
  currentSeasonId: string
): SeasonRegistryEntry[] {
  if (!registry) {
    return [];
  }

  return registry.seasons.filter(
    (entry) =>
      entry.seasonId !== currentSeasonId &&
      (entry.phase === 'archived' ||
        entry.phase === 'claim' ||
        entry.seasonId === 'season-zero')
  );
}

export function resolveSeasonPhaseLabel(phase: SeasonPhase): string {
  switch (phase) {
    case 'live':
      return 'Live';
    case 'upcoming':
      return 'Soon';
    case 'claim':
      return 'Claim';
    default:
      return 'Archive';
  }
}
