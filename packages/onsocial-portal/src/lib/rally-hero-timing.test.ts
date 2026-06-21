import { describe, expect, it } from 'vitest';

import {
  formatSeasonRunWindow,
  resolveRallyHeroTimingMeta,
} from '@/lib/rally-hero-timing';

const MAR_1_2026_NS = Date.parse('2026-03-01T12:00:00Z') * 1_000_000;
const MAR_14_2026_NS = Date.parse('2026-03-14T12:00:00Z') * 1_000_000;
const JUN_16_2026_NS = Date.parse('2026-06-16T12:00:00Z') * 1_000_000;
const JUN_17_2026_NS = Date.parse('2026-06-17T12:00:00Z') * 1_000_000;
const APR_1_2026_NS = Date.parse('2026-04-01T12:00:00Z') * 1_000_000;
const APR_21_2026_NS = Date.parse('2026-04-21T12:00:00Z') * 1_000_000;
const REFERENCE_MS = Date.parse('2026-06-20T12:00:00Z');

describe('formatSeasonRunWindow', () => {
  it('formats same-month windows with compact year', () => {
    expect(formatSeasonRunWindow(MAR_1_2026_NS, MAR_14_2026_NS, REFERENCE_MS))
      .toEqual({
        label: "Mar 1–14 '26",
        title: 'Mar 1 – 14, 2026',
      });
    expect(formatSeasonRunWindow(JUN_16_2026_NS, JUN_17_2026_NS, REFERENCE_MS))
      .toEqual({
        label: "Jun 16–17 '26",
        title: 'Jun 16 – 17, 2026',
      });
  });

  it('formats cross-month windows in the same year', () => {
    expect(formatSeasonRunWindow(MAR_1_2026_NS, APR_21_2026_NS, REFERENCE_MS))
      .toEqual({
        label: "Mar 1–Apr 21 '26",
        title: 'Mar 1 – Apr 21, 2026',
      });
  });

  it('falls back to ended date when start is missing', () => {
    expect(formatSeasonRunWindow(0, MAR_14_2026_NS, REFERENCE_MS)).toEqual({
      label: "Ended Mar 14 '26",
      title: 'Season ended Mar 14, 2026',
    });
  });
});

describe('resolveRallyHeroTimingMeta', () => {
  it('shows open date for upcoming seasons', () => {
    expect(
      resolveRallyHeroTimingMeta({
        phase: 'upcoming',
        startsAtNs: APR_1_2026_NS,
        endsAtNs: APR_21_2026_NS,
        nowMs: REFERENCE_MS,
      })
    ).toEqual({
      label: 'Opens Apr 1',
      title: 'Opens Apr 1',
    });
  });

  it('shows end date for live seasons', () => {
    expect(
      resolveRallyHeroTimingMeta({
        phase: 'live',
        startsAtNs: MAR_1_2026_NS,
        endsAtNs: APR_21_2026_NS,
        nowMs: REFERENCE_MS,
      })
    ).toEqual({
      label: 'Ends Apr 21',
      title: 'Ends Apr 21',
    });
  });

  it('shows run window for archived claim-open seasons', () => {
    expect(
      resolveRallyHeroTimingMeta({
        phase: 'claim_open',
        startsAtNs: JUN_16_2026_NS,
        endsAtNs: JUN_17_2026_NS,
        nowMs: REFERENCE_MS,
      })
    ).toEqual({
      label: "Jun 16–17 '26",
      title: 'Jun 16 – 17, 2026',
    });
  });
});
