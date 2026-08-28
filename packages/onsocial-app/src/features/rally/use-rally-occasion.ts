'use client';

import { useEffect, useState } from 'react';
import {
  fetchRallyRegistry,
  resolveRallyOccasion,
  resolveRallyPresentation,
  type RallyRegistryEntry,
} from '@/lib/rally-season';

const REGISTRY_REFRESH_MS = 60_000;

export type RallyOccasion = {
  loaded: boolean;
  entry: RallyRegistryEntry | null;
  seasonId: string | null;
  pageTitle: string;
  profileBadgeLabel: string;
};

export function useRallyOccasion(): RallyOccasion {
  const [loaded, setLoaded] = useState(false);
  const [entry, setEntry] = useState<RallyRegistryEntry | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const registry = await fetchRallyRegistry();
      if (cancelled) return;
      setEntry(resolveRallyOccasion(registry));
      setLoaded(true);
    };
    void load();
    const timer = window.setInterval(() => {
      void load();
    }, REGISTRY_REFRESH_MS);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);

  const presentation = entry
    ? resolveRallyPresentation(entry.seasonId, entry.label)
    : resolveRallyPresentation('season-one');

  return {
    loaded,
    entry,
    seasonId: entry?.seasonId ?? null,
    pageTitle: presentation.pageTitle,
    profileBadgeLabel: presentation.profileBadgeLabel,
  };
}
