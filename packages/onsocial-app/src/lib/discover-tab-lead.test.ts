import { describe, expect, it } from 'vitest';
import {
  discoverDaosLead,
  discoverGuildsLead,
  discoverProfilesLead,
  discoverTopicsLead,
  discoverTrendingLead,
} from './discover-tab-lead';

describe('discoverProfilesLead', () => {
  it('shows count when browsing', () => {
    expect(discoverProfilesLead(12_500, '')).toBe('12.5K profiles');
  });

  it('shows search line when filtered', () => {
    expect(discoverProfilesLead(12_500, 'alex')).toBe('Searching “alex”');
  });

  it('falls back without total', () => {
    expect(discoverProfilesLead(null, '')).toBe('Profiles');
  });
});

describe('discoverDaosLead', () => {
  it('shows NEAR DAO count without factory jargon', () => {
    expect(discoverDaosLead(5310, '', false)).toBe('5,310 NEAR DAOs');
  });

  it('shows search when querying', () => {
    expect(discoverDaosLead(5310, 'community', false)).toBe(
      'Searching “community”'
    );
  });

  it('shows syncing copy', () => {
    expect(discoverDaosLead(0, '', true)).toBe('Finding NEAR DAOs…');
  });
});

describe('discoverGuildsLead', () => {
  it('shows topic filter', () => {
    expect(discoverGuildsLead('', 'Music')).toBe('Guilds · Music');
  });
});

describe('discoverTopicsLead', () => {
  it('shows prefix filter', () => {
    expect(discoverTopicsLead('music')).toBe('Topics · #music');
  });
});

describe('discoverTrendingLead', () => {
  it('is social and brand-free', () => {
    expect(discoverTrendingLead()).toBe("What's moving");
  });
});
