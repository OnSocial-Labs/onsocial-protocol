import { describe, expect, it } from 'vitest';
import {
  applyDiscoverFilterParams,
  discoverCraftPath,
  discoverIndustryPath,
  discoverSearchOptionsFromFilters,
  parseDiscoverProfileFilters,
} from './discover-profiles';

describe('discover profile filters', () => {
  it('parses face and industry from query params', () => {
    expect(
      parseDiscoverProfileFilters({
        face: 'hiring',
        industry: 'Healthcare',
      })
    ).toEqual({ face: 'hiring', industry: 'Healthcare' });
    expect(
      parseDiscoverProfileFilters({ face: 'people', industry: 'Healthcare' })
    ).toEqual({ face: 'people' });
    expect(
      parseDiscoverProfileFilters({
        face: 'daos',
        industry: 'Film',
      })
    ).toEqual({ face: 'daos', industry: 'Film' });
  });

  it('keeps URLs clean for the default All chip', () => {
    const params = new URLSearchParams('face=orgs&industry=Healthcare');
    applyDiscoverFilterParams(params, 'all', '');
    expect(params.toString()).toBe('');
  });

  it('opens People Discover on the Profiles tab', () => {
    expect(discoverCraftPath('Writer')).toBe(
      '/discover?tab=profiles&face=people&craft=writer'
    );
  });

  it('opens Orgs or DAOs by industry, never Hiring', () => {
    expect(discoverIndustryPath('Music', 'org')).toBe(
      '/discover?tab=profiles&face=orgs&industry=Music'
    );
    expect(discoverIndustryPath('Film', 'dao')).toBe(
      '/discover?tab=profiles&face=daos&industry=Film'
    );
  });

  it('maps hiring to org + open jobs', () => {
    expect(
      discoverSearchOptionsFromFilters({
        face: 'hiring',
        industry: 'Healthcare',
      })
    ).toEqual({
      kind: 'org',
      hiring: true,
      industry: 'Healthcare',
    });
    expect(
      discoverSearchOptionsFromFilters({
        face: 'daos',
        industry: 'Film',
      })
    ).toEqual({
      kind: 'dao',
      industry: 'Film',
    });
  });
});
