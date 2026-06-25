import { describe, expect, it } from 'vitest';
import { getSeasonPresentation } from '@/lib/active-season';
import { buildProfileRallyParticipations } from '@/features/season/profile-rally-credentials';
import type { SeasonRegistrySnapshot } from '@/lib/season-registry';
import { formatProfileRallyMenuTitle } from '@/features/profile/profile-identity-credentials';

describe('buildProfileRallyParticipations', () => {
  const registry: SeasonRegistrySnapshot = {
    live: null,
    upcoming: null,
    claim: {
      seasonId: 'season-one',
      label: 'OnSocial Rally',
      active: true,
      phase: 'claim',
      starts_at_ns: '0',
      ends_at_ns: '0',
      claim_starts_at_ns: '0',
      is_live: false,
      claim_open: true,
      rallyPath: '/season/season-one',
    },
    seasons: [
      {
        seasonId: 'season-one',
        label: 'OnSocial Rally',
        active: true,
        phase: 'claim',
        starts_at_ns: '0',
        ends_at_ns: '0',
        claim_starts_at_ns: '0',
        is_live: false,
        claim_open: true,
        rallyPath: '/season/season-one',
      },
      {
        seasonId: 'season-zero',
        label: 'Genesis Rally',
        active: false,
        phase: 'archived',
        starts_at_ns: '0',
        ends_at_ns: '0',
        claim_starts_at_ns: null,
        is_live: false,
        claim_open: false,
        rallyPath: '/season-zero',
      },
    ],
    resolvedPromoSeasonId: null,
    resolvedActiveSeasonId: 'season-one',
  };

  it('does not mark past-season participation as live when registry has no live season', () => {
    const participations = buildProfileRallyParticipations({
      registry,
      activeSeasonId: 'season-one',
      activeBadge: { rank: 12, score: 100 },
      genesisBadge: { rank: 4, score: 50 },
    });

    expect(participations).toHaveLength(2);
    expect(
      participations.find((item) => item.seasonId === 'season-one')?.live
    ).toBe(false);
    expect(
      participations.find((item) => item.seasonId === 'season-zero')?.live
    ).toBe(false);
  });

  it('marks participation live only when registry phase is live', () => {
    const liveRegistry: SeasonRegistrySnapshot = {
      ...registry,
      live: {
        seasonId: 'season-two',
        label: 'Season Two',
        active: true,
        phase: 'live',
        starts_at_ns: '0',
        ends_at_ns: '0',
        claim_starts_at_ns: null,
        is_live: true,
        claim_open: false,
        rallyPath: '/season/season-two',
      },
      seasons: [
        ...registry.seasons,
        {
          seasonId: 'season-two',
          label: 'Season Two',
          active: true,
          phase: 'live',
          starts_at_ns: '0',
          ends_at_ns: '0',
          claim_starts_at_ns: null,
          is_live: true,
          claim_open: false,
          rallyPath: '/season/season-two',
        },
      ],
      resolvedActiveSeasonId: 'season-two',
    };

    const participations = buildProfileRallyParticipations({
      registry: liveRegistry,
      activeSeasonId: 'season-two',
      activeBadge: { rank: 3, score: 20 },
      genesisBadge: null,
    });

    expect(participations).toHaveLength(1);
    expect(participations[0]?.live).toBe(true);
  });
});

describe('formatProfileRallyMenuTitle', () => {
  it('uses Genesis chip label for season zero', () => {
    const presentation = getSeasonPresentation('season-zero');

    expect(
      formatProfileRallyMenuTitle({
        seasonId: 'season-zero',
        presentation,
        rank: 8,
        live: false,
      })
    ).toBe('Genesis');
  });
});
