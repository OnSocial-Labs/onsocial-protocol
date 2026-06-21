import { describe, expect, it } from 'vitest';

import {
  parseJoinRallyMinAmountYocto,
} from '../../src/services/seasons/join-rally-onchain-config.js';

describe('join-rally-onchain-config', () => {
  it('parses join rally min amount from action config JSON', () => {
    expect(
      parseJoinRallyMinAmountYocto(
        JSON.stringify({
          label: 'Join Rally',
          active: true,
          min_amount: '1000000000000000000000',
          target_types: ['rally'],
        })
      )?.toString()
    ).toBe('1000000000000000000000');
  });

  it('returns null when min amount is missing or invalid', () => {
    expect(parseJoinRallyMinAmountYocto('null')).toBeNull();
    expect(
      parseJoinRallyMinAmountYocto(
        JSON.stringify({
          label: 'Join Rally',
          active: true,
          min_amount: '0',
          target_types: ['rally'],
        })
      )
    ).toBeNull();
  });
});
