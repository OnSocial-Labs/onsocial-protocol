import { describe, expect, it } from 'vitest';
import {
  applyDiscoverFilterParams,
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
