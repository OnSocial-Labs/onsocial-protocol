import { describe, expect, it } from 'vitest';
import { sliceHiringOrgIds, uniqueHiringOrgIds } from './discover-hiring';

describe('uniqueHiringOrgIds', () => {
  it('keeps first-seen orgs from matching roles', () => {
    expect(
      uniqueHiringOrgIds([
        { orgAccountId: 'studio.near' },
        { orgAccountId: 'clinic.near' },
        { orgAccountId: 'studio.near' },
        { orgAccountId: 'Studio.near' },
      ])
    ).toEqual(['studio.near', 'clinic.near']);
  });
});

describe('sliceHiringOrgIds', () => {
  it('pages unique orgs', () => {
    expect(sliceHiringOrgIds(['a.near', 'b.near', 'c.near'], 1, 1)).toEqual({
      ids: ['b.near'],
      hasMore: true,
    });
    expect(sliceHiringOrgIds(['a.near'], 0, 24)).toEqual({
      ids: ['a.near'],
      hasMore: false,
    });
  });
});
