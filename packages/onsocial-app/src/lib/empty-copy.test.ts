import { describe, expect, it } from 'vitest';
import { emptyCopy } from './empty-copy';

describe('emptyCopy', () => {
  it('keeps status lines short and icon-free', () => {
    expect(emptyCopy.noMatches).toBe('No matches.');
    expect(emptyCopy.nothingHereYet).toBe('Nothing here yet.');
    expect(emptyCopy.nothingMovingYet).toBe('Nothing moving yet.');
    expect(emptyCopy.noActiveListingsSalesBelow).toMatch(/recent sales/);
    for (const line of [
      emptyCopy.noMatches,
      emptyCopy.nothingHereYet,
      emptyCopy.nothingMovingYet,
      emptyCopy.noActiveListingsSalesBelow,
    ]) {
      expect(line.includes('\n')).toBe(false);
    }
  });
});
