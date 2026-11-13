import { describe, expect, it } from 'vitest';
import { RelayExecutionError } from '@onsocial/sdk';
import { classifyBoostSponsorFailure } from '@/lib/boost-sponsor';

describe('classifyBoostSponsorFailure', () => {
  it('treats the daily cap code as a wallet fallback', () => {
    expect(
      classifyBoostSponsorFailure({
        name: 'BoostSponsorDailyCapError',
        code: 'BOOST_SPONSOR_DAILY_CAP',
        message: "Today's free boost is used up.",
      })
    ).toBe('cap');
  });

  it('recognizes the relayer cap string on an Error', () => {
    const error = new Error('BOOST_SPONSOR_DAILY_CAP');
    expect(classifyBoostSponsorFailure(error)).toBe('cap');
  });

  it('keeps a chain revert off the wallet fallback', () => {
    expect(
      classifyBoostSponsorFailure(
        new RelayExecutionError('reverted', 'tx-hash', {})
      )
    ).toBe('reverted');
  });

  it('stops when the person dismisses the wallet', () => {
    expect(
      classifyBoostSponsorFailure(new Error('User rejected the request'))
    ).toBe('cancelled');
  });

  it('falls back when the relayer is down', () => {
    expect(classifyBoostSponsorFailure(new Error('Failed to fetch'))).toBe(
      'unavailable'
    );
  });
});
