import { describe, expect, it } from 'vitest';
import {
  ALL_CORE_ACTION_TYPES,
  getCoreParityCases,
} from './core-parity.fixtures.js';
import { buildRequest, prepareCoreRequest } from './actions.js';

describe('core contract parity suite', () => {
  const cases = getCoreParityCases('testnet');

  for (const testCase of cases) {
    it(`matches canonical core action for ${testCase.name}`, () => {
      expect(testCase.action).toEqual(testCase.expectedAction);
      expect(testCase.targetAccount).toBe('core.onsocial.testnet');
    });
  }

  it('covers every Action variant declared by the contract', () => {
    const covered = new Set(cases.map((c) => c.expectedAction.type));
    const missing = ALL_CORE_ACTION_TYPES.filter((t) => !covered.has(t));
    expect(
      missing,
      `missing parity coverage for: ${missing.join(', ')}`
    ).toEqual([]);
  });

  it('emits no parity cases for action types unknown to the contract', () => {
    const declared = new Set<string>(ALL_CORE_ACTION_TYPES);
    const stray = [...new Set(cases.map((c) => c.expectedAction.type))].filter(
      (t) => !declared.has(t)
    );
    expect(
      stray,
      `unknown action types in fixtures: ${stray.join(', ')}`
    ).toEqual([]);
  });

  it('builds a deterministic execute request for prepared core requests', () => {
    const request = prepareCoreRequest(cases[0].action, 'testnet');

    const payload = buildRequest({
      action: request.action,
      targetAccount: 'alice.testnet',
      options: { refund_unused_deposit: true },
    });

    expect(payload).toEqual({
      target_account: 'alice.testnet',
      action: {
        data: {
          'profile/bio': 'Builder',
          'profile/name': 'Alice',
          'profile/v': '1',
        },
        type: 'set',
      },
      options: { refund_unused_deposit: true },
    });
  });
});
