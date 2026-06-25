'use client';

import {
  ARCHIVED_GENESIS_SEASON_ID,
  getActiveSeasonId,
  getSeasonPresentation,
  type SeasonPresentation,
} from '@/lib/active-season';
import {
  useActiveSeasonProfileBadge,
  useSeasonZeroProfileBadge,
  type SeasonProfileBadge,
} from '@/features/season/season-zero-participant-badge';
import {
  useSeasonRegistry,
  type SeasonRegistryEntry,
  type SeasonRegistrySnapshot,
} from '@/lib/season-registry';
import { useMemo } from 'react';

export interface ProfileRallyParticipation {
  seasonId: string;
  presentation: SeasonPresentation;
  rank: number;
  live: boolean;
}

function registryEntryForSeason(
  registry: SeasonRegistrySnapshot | null,
  seasonId: string
): SeasonRegistryEntry | null {
  if (!registry) {
    return null;
  }

  return registry.seasons.find((entry) => entry.seasonId === seasonId) ?? null;
}

function presentationForSeason(
  seasonId: string,
  registry: SeasonRegistrySnapshot | null
): SeasonPresentation {
  const entry = registryEntryForSeason(registry, seasonId);

  if (!entry) {
    return getSeasonPresentation(seasonId);
  }

  return getSeasonPresentation(seasonId, {
    label: entry.label,
    phase: entry.phase,
    rallyPath: entry.rallyPath,
  });
}

export function buildProfileRallyParticipations(input: {
  registry: SeasonRegistrySnapshot | null;
  activeSeasonId: string;
  activeBadge: SeasonProfileBadge | null;
  genesisBadge: SeasonProfileBadge | null;
}): ProfileRallyParticipation[] {
  const items: ProfileRallyParticipation[] = [];

  if (input.activeBadge) {
    const presentation = presentationForSeason(
      input.activeSeasonId,
      input.registry
    );

    items.push({
      seasonId: input.activeSeasonId,
      presentation,
      rank: input.activeBadge.rank,
      live: presentation.phase === 'live',
    });
  }

  if (input.genesisBadge) {
    const presentation = presentationForSeason(
      ARCHIVED_GENESIS_SEASON_ID,
      input.registry
    );

    items.push({
      seasonId: ARCHIVED_GENESIS_SEASON_ID,
      presentation,
      rank: input.genesisBadge.rank,
      live: presentation.phase === 'live',
    });
  }

  return items;
}

export function useProfileRallyParticipations(
  accountId: string | null,
  enabled: boolean
): ProfileRallyParticipation[] {
  const activeSeasonId = getActiveSeasonId();
  const activeBadge = useActiveSeasonProfileBadge(accountId, enabled);
  const genesisBadge = useSeasonZeroProfileBadge(accountId, enabled);
  const { registry } = useSeasonRegistry({ enabled });

  return useMemo(
    () =>
      buildProfileRallyParticipations({
        registry,
        activeSeasonId,
        activeBadge,
        genesisBadge,
      }),
    [activeBadge, activeSeasonId, genesisBadge, registry]
  );
}
