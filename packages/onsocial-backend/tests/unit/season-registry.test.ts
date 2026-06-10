import { describe, expect, it } from 'vitest';

import {
  assertSeasonId,
  normalizeSeasonId,
} from '../../src/services/seasons/season-registry.js';

describe('season-registry', () => {
  it('accepts valid season ids', () => {
    expect(normalizeSeasonId('season-one')).toBe('season-one');
    expect(normalizeSeasonId('season-zero')).toBe('season-zero');
    expect(normalizeSeasonId('  Season-One  ')).toBe('season-one');
  });

  it('rejects invalid season ids', () => {
    expect(normalizeSeasonId('')).toBeNull();
    expect(normalizeSeasonId('Season One')).toBeNull();
    expect(normalizeSeasonId('../etc')).toBeNull();
  });

  it('assertSeasonId throws for invalid ids', () => {
    expect(() => assertSeasonId('bad id')).toThrow(/Invalid season_id/);
  });
});
