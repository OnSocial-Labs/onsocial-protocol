import { describe, expect, it } from 'vitest';

import { parseSeasonJoinEntryYocto } from '../../src/services/seasons/season-join-entry.js';

describe('parseSeasonJoinEntryYocto', () => {
  it('accepts positive integer yocto strings', () => {
    expect(parseSeasonJoinEntryYocto('1000000000000000000000')).toBe(
      '1000000000000000000000'
    );
  });

  it('rejects empty, zero, and non-numeric values', () => {
    expect(parseSeasonJoinEntryYocto(null)).toBeNull();
    expect(parseSeasonJoinEntryYocto('')).toBeNull();
    expect(parseSeasonJoinEntryYocto('0')).toBeNull();
    expect(parseSeasonJoinEntryYocto('abc')).toBeNull();
  });
});
