import { describe, expect, it } from 'vitest';
import {
  discoverDaosLead,
  discoverGuildsLead,
  discoverProfilesLead,
  discoverTopicsLead,
  discoverTrendingLead,
  discoverTrendingProfilesHeading,
} from './discover-tab-lead';

const COUNTS = {
  all: 12_500,
  people: 12,
  orgs: 4,
  daos: 4,
  offers: 2,
  hiring: 3,
};

describe('discoverProfilesLead', () => {
  it('shows compact count for All', () => {
    expect(discoverProfilesLead(COUNTS, 'all')).toBe('12.5K profiles');
  });

  it('shows the active face count', () => {
    expect(discoverProfilesLead(COUNTS, 'people')).toBe('12 people');
    expect(discoverProfilesLead(COUNTS, 'orgs')).toBe('4 orgs');
    expect(discoverProfilesLead(COUNTS, 'daos')).toBe('4 DAOs');
    expect(discoverProfilesLead(COUNTS, 'offers')).toBe('2 offers');
    expect(discoverProfilesLead(COUNTS, 'hiring')).toBe('3 hiring');
  });

  it('falls back without totals', () => {
    expect(discoverProfilesLead(null, 'all')).toBe('Profiles');
    expect(discoverProfilesLead(null, 'people')).toBe('People');
  });

  it('keeps craft and industry on the lead', () => {
    expect(discoverProfilesLead(COUNTS, 'hiring', 'Healthcare')).toBe(
      '3 hiring · Healthcare'
    );
    expect(discoverProfilesLead(COUNTS, 'orgs', 'Film')).toBe('4 orgs · Film');
    expect(discoverProfilesLead(COUNTS, 'daos', 'Film')).toBe('4 DAOs · Film');
    expect(discoverProfilesLead(COUNTS, 'people', '', 'writer')).toBe(
      '12 people · Writer'
    );
  });
});

describe('discoverDaosLead', () => {
  it('shows NEAR DAO count without factory jargon', () => {
    expect(discoverDaosLead(5310, '', false)).toBe('5,310 NEAR DAOs');
  });

  it('keeps the count while filtering', () => {
    expect(discoverDaosLead(5310, 'community', false)).toBe('5,310 NEAR DAOs');
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

describe('discoverTrendingProfilesHeading', () => {
  it('keeps the peek name until a face or industry is on', () => {
    expect(discoverTrendingProfilesHeading()).toBe('Active');
    expect(discoverTrendingProfilesHeading('hiring', 'Healthcare')).toBe(
      'Hiring · Healthcare'
    );
    expect(discoverTrendingProfilesHeading('people')).toBe('People');
  });
});
