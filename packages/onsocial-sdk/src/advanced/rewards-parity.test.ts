import { describe, expect, it } from 'vitest';
import { getRewardsParityCases } from './rewards-parity.fixtures.js';

describe('rewards contract parity suite', () => {
  const cases = getRewardsParityCases('testnet');

  for (const testCase of cases) {
    it(`matches canonical rewards action for ${testCase.name}`, () => {
      expect(testCase.action).toEqual(testCase.expectedAction);
      expect(testCase.targetAccount).toBe('rewards.onsocial.testnet');
    });
  }
});
