import { describe, expect, it } from 'vitest';
import {
  ALL_SCARCES_ACTION_TYPES,
  getScarcesParityCases,
} from './scarces-parity.fixtures.js';

describe('scarces contract parity suite', () => {
  const cases = getScarcesParityCases('testnet');

  for (const testCase of cases) {
    it(`matches canonical scarces action for ${testCase.name}`, () => {
      expect(testCase.action).toEqual(testCase.expectedAction);
      expect(testCase.targetAccount).toBe('scarces.onsocial.testnet');
    });
  }

  it('covers every Action variant declared by the contract', () => {
    const covered = new Set(cases.map((c) => c.expectedAction.type));
    const missing = ALL_SCARCES_ACTION_TYPES.filter((t) => !covered.has(t));
    expect(missing, `missing parity coverage for: ${missing.join(', ')}`).toEqual([]);
  });

  it('emits no parity cases for action types unknown to the contract', () => {
    const declared = new Set<string>(ALL_SCARCES_ACTION_TYPES);
    const stray = [...new Set(cases.map((c) => c.expectedAction.type))].filter(
      (t) => !declared.has(t),
    );
    expect(stray, `unknown action types in fixtures: ${stray.join(', ')}`).toEqual([]);
  });
});
