import { describe, expect, it } from 'vitest';
import { parseExcludeTypes } from '../../src/services/notifications/index.js';

describe('parseExcludeTypes', () => {
  it('parses a single type', () => {
    expect(parseExcludeTypes('dm')).toEqual(['dm']);
  });

  it('parses a comma-separated list', () => {
    expect(parseExcludeTypes('dm,reward_claimed,boost_locked')).toEqual([
      'dm',
      'reward_claimed',
      'boost_locked',
    ]);
  });

  it('trims blanks and drops empty tokens', () => {
    expect(parseExcludeTypes(' dm, ,boost_locked ')).toEqual([
      'dm',
      'boost_locked',
    ]);
  });

  it('returns an empty list when unset', () => {
    expect(parseExcludeTypes(undefined)).toEqual([]);
    expect(parseExcludeTypes('')).toEqual([]);
  });
});
