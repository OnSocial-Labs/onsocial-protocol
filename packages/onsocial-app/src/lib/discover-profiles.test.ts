import { describe, expect, it } from 'vitest';
import {
  applyDiscoverFilterParams,
  discoverCraftPath,
  discoverSearchOptionsFromFilters,
  parseDiscoverProfileFilters,
} from './discover-profiles';

describe('discoverCraftPath', () => {
  it('opens People Discover on the Profiles tab for that craft', () => {
    expect(discoverCraftPath('live_music')).toBe(
      '/discover?tab=profiles&face=people&craft=live_music'
    );
    expect(discoverCraftPath('#Writer')).toBe(
      '/discover?tab=profiles&face=people&craft=writer'
    );
  });
});

describe('discover profile filters', () => {
  it('parses a craft deep-link as People', () => {
    expect(
      parseDiscoverProfileFilters({
        face: 'orgs',
        craft: 'Live_Music',
      })
    ).toEqual({ face: 'people', craft: 'live_music' });
  });

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
  });

  it('keeps URLs clean for the default All chip', () => {
    const params = new URLSearchParams('face=orgs&industry=Healthcare');
    applyDiscoverFilterParams(params, 'all', '');
    expect(params.toString()).toBe('');
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
  });
});
