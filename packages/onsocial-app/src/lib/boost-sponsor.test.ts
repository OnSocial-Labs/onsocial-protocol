import { describe, expect, it } from 'vitest';
import { RelayExecutionError } from '@onsocial/sdk';
import { classifyBoostSponsorFailure } from '@/lib/boost-sponsor';

describe('classifyBoostSponsorFailure', () => {
  it('treats a sponsorship limit as a wallet fallback', () => {
    expect(
      classifyBoostSponsorFailure({
        name: 'BoostSponsorLimitError',
        code: 'BOOST_SPONSOR_LIMIT',
        message: 'Could not commit SOCIAL.',
      })
    ).toBe('limited');
  });

  it('recognizes the relayer limit string on an Error', () => {
    const error = new Error('BOOST_SPONSOR_LIMIT');
    expect(classifyBoostSponsorFailure(error)).toBe('limited');
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
