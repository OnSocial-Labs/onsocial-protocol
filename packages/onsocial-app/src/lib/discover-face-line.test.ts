import { describe, expect, it } from 'vitest';
import {
  discoverFaceLine,
  leadTitleByAccount,
  withDiscoverFaceLines,
} from './discover-face-line';

describe('discoverFaceLine', () => {
  it('uses the title alone for one', () => {
    expect(discoverFaceLine('  Brand   identity ', 1)).toBe('Brand identity');
    expect(discoverFaceLine('Nurse', 0)).toBe('Nurse');
  });

  it('adds the count when there is more than one', () => {
    expect(discoverFaceLine('Brand identity', 2)).toBe('Brand identity · 2');
    expect(discoverFaceLine('Nurse', 4)).toBe('Nurse · 4');
  });

  it('stays empty without a title', () => {
    expect(discoverFaceLine('   ', 3)).toBeNull();
    expect(discoverFaceLine(null, 2)).toBeNull();
  });
});

describe('leadTitleByAccount', () => {
  it('keeps the first title for each account', () => {
    expect(
      leadTitleByAccount([
        { accountId: 'Alice.near', title: 'Brand identity' },
        { accountId: 'alice.near', title: 'Workshops' },
        { accountId: 'clinic.near', title: '  ' },
        { accountId: 'clinic.near', title: 'Nurse' },
      ])
    ).toEqual({
      'alice.near': 'Brand identity',
      'clinic.near': 'Nurse',
    });
  });
});

describe('withDiscoverFaceLines', () => {
  it('stamps the offer title and directory count', () => {
    expect(
      withDiscoverFaceLines(
        [
          { accountId: 'alice.near', offerCount: 2, openJobsCount: 0 },
          { accountId: 'quiet.near', offerCount: 1 },
        ],
        { 'alice.near': 'Brand identity' },
        'offers'
      )
    ).toEqual([
      {
        accountId: 'alice.near',
        offerCount: 2,
        openJobsCount: 0,
        faceLine: 'Brand identity · 2',
      },
      { accountId: 'quiet.near', offerCount: 1 },
    ]);
  });

  it('stamps the role title', () => {
    expect(
      withDiscoverFaceLines(
        [{ accountId: 'Clinic.near', openJobsCount: 1 }],
        { 'clinic.near': 'Nurse' },
        'hiring'
      )
    ).toEqual([
      {
        accountId: 'Clinic.near',
        openJobsCount: 1,
        faceLine: 'Nurse',
      },
    ]);
  });
});
