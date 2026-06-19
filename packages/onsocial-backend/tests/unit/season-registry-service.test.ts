import { describe, expect, it } from 'vitest';

import {
  resolveSeasonPhase,
  resolveSeasonRegistryPointers,
  type SeasonRegistryEntry,
} from '../../src/services/seasons/season-registry-service.js';

function config(overrides: Record<string, unknown> = {}) {
  return {
    label: 'Test',
    active: true,
    starts_at_ns: '1000',
    ends_at_ns: '2000',
    claim_starts_at_ns: '2000',
    is_live: false,
    claim_open: false,
    ...overrides,
  };
}

function entry(
  seasonId: string,
  phase: SeasonRegistryEntry['phase'],
  startsAtNs: string
): SeasonRegistryEntry {
  return {
    seasonId,
    label: seasonId,
    active: phase !== 'archived',
    phase,
    starts_at_ns: startsAtNs,
    ends_at_ns: '9000',
    claim_starts_at_ns: '9000',
    is_live: phase === 'live',
    claim_open: phase === 'claim',
    rallyPath: `/season/${seasonId}`,
  };
}

describe('season registry service', () => {
  it('marks active in-window seasons as live', () => {
    expect(
      resolveSeasonPhase(
        config({ is_live: true, starts_at_ns: '1000', ends_at_ns: '3000' }),
        1500n
      )
    ).toBe('live');
  });

  it('marks future active seasons as upcoming', () => {
    expect(
      resolveSeasonPhase(
        config({ starts_at_ns: '5000', ends_at_ns: '9000' }),
        1500n
      )
    ).toBe('upcoming');
  });

  it('marks ended seasons with open claims as claim', () => {
    expect(
      resolveSeasonPhase(
        config({
          is_live: false,
          claim_open: true,
          ends_at_ns: '1000',
        }),
        2500n
      )
    ).toBe('claim');
  });

  it('prefers upcoming over claim for homepage promo when no live season', () => {
    const pointers = resolveSeasonRegistryPointers([
      entry('season-two', 'upcoming', '5000'),
      entry('season-one', 'claim', '1000'),
    ]);

    expect(pointers.upcoming?.seasonId).toBe('season-two');
    expect(pointers.claim?.seasonId).toBe('season-one');
    expect(pointers.resolvedPromoSeasonId).toBe('season-two');
    expect(pointers.resolvedActiveSeasonId).toBe('season-one');
  });

  it('prefers live season for promo and active routes', () => {
    const pointers = resolveSeasonRegistryPointers([
      entry('season-two', 'upcoming', '8000'),
      entry('season-one', 'live', '1000'),
    ]);

    expect(pointers.live?.seasonId).toBe('season-one');
    expect(pointers.resolvedPromoSeasonId).toBe('season-one');
    expect(pointers.resolvedActiveSeasonId).toBe('season-one');
  });

  it('picks the nearest upcoming season when multiple are configured', () => {
    const pointers = resolveSeasonRegistryPointers([
      entry('season-three', 'upcoming', '9000'),
      entry('season-two', 'upcoming', '5000'),
    ]);

    expect(pointers.upcoming?.seasonId).toBe('season-two');
    expect(pointers.resolvedPromoSeasonId).toBe('season-two');
  });
});
