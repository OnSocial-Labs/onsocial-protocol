import { describe, expect, it } from 'vitest';
import { discoverDirectoryActionVisibility } from './discover-directory-action-visibility';

describe('discoverDirectoryActionVisibility', () => {
  it('hides a verb when its count is zero or unknown', () => {
    expect(
      discoverDirectoryActionVisibility(
        { offerCount: 0, openJobsCount: 0 },
        'offers'
      )
    ).toEqual({ offers: false, hiring: false });
    expect(discoverDirectoryActionVisibility({}, 'hiring')).toEqual({
      offers: false,
      hiring: false,
    });
  });

  it('shows only the verb for the face, even when both counts are above zero', () => {
    expect(
      discoverDirectoryActionVisibility(
        { offerCount: 2, openJobsCount: 3 },
        'offers'
      )
    ).toEqual({ offers: true, hiring: false });
    expect(
      discoverDirectoryActionVisibility(
        { offerCount: 2, openJobsCount: 3 },
        'hiring'
      )
    ).toEqual({ offers: false, hiring: true });
  });

  it('hides the face verb when that count is zero', () => {
    expect(
      discoverDirectoryActionVisibility(
        { offerCount: 0, openJobsCount: 1 },
        'offers'
      )
    ).toEqual({ offers: false, hiring: false });
    expect(
      discoverDirectoryActionVisibility(
        { offerCount: 1, openJobsCount: 0 },
        'hiring'
      )
    ).toEqual({ offers: false, hiring: false });
  });
});
