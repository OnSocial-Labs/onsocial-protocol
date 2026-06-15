import { describe, expect, it } from 'vitest';

import { resolveSeasonPhase } from '../../src/services/seasons/season-registry-service.js';

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

describe('season registry service', () => {
  it('marks active in-window seasons as live', () => {
    expect(
      resolveSeasonPhase(
        config({ is_live: true, starts_at_ns: '1000', ends_at_ns: '3000' }),
        1500n
      )
    ).toBe('live');
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
});
