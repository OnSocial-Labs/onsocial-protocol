import { describe, expect, it } from 'vitest';
import { BOOST_LOCK_PERIODS, buildBoostLockMsg } from './boost-msg.js';
import { getBoostMsgParityCases } from './boost-parity.fixtures.js';

describe('boost ft_on_transfer msg parity suite', () => {
  const cases = getBoostMsgParityCases();

  for (const testCase of cases) {
    it(`emits a parseable msg for ${testCase.name}`, () => {
      const parsed = JSON.parse(testCase.msg) as Record<string, unknown>;
      expect(parsed.action).toBe(testCase.expectedAction);
      if (testCase.expectedAction === 'lock') {
        expect(parsed.months).toBe(testCase.expectedMonths);
        expect(BOOST_LOCK_PERIODS).toContain(parsed.months);
      }
    });
  }

  it('rejects invalid lock periods at build time', () => {
    expect(() =>
      // @ts-expect-error — runtime guard, not type-checked.
      buildBoostLockMsg(3)
    ).toThrow(/Invalid boost lock period/);
  });
});
