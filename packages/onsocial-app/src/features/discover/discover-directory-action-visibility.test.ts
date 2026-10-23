import { describe, expect, it } from 'vitest';
import { discoverDirectoryActionVisibility } from './discover-directory-action-visibility';

describe('discoverDirectoryActionVisibility', () => {
  it('hides a verb when its count is zero or unknown', () => {
    expect(
      discoverDirectoryActionVisibility({
        offerCount: 0,
        openJobsCount: 0,
      })
    ).toEqual({ offers: false, hiring: false });
    expect(discoverDirectoryActionVisibility({})).toEqual({
      offers: false,
      hiring: false,
    });
  });

  it('shows each verb on its own count', () => {
    expect(
      discoverDirectoryActionVisibility({
        offerCount: 2,
        openJobsCount: 0,
      })
    ).toEqual({ offers: true, hiring: false });
    expect(
      discoverDirectoryActionVisibility({
        offerCount: 0,
        openJobsCount: 1,
      })
    ).toEqual({ offers: false, hiring: true });
    expect(
      discoverDirectoryActionVisibility({
        offerCount: 1,
        openJobsCount: 3,
      })
    ).toEqual({ offers: true, hiring: true });
  });
});
