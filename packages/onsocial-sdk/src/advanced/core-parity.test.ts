import { describe, expect, it } from 'vitest';
import { buildSigningMessage, buildSigningPayload } from './signing.js';
import {
  ALL_CORE_ACTION_TYPES,
  getCoreParityCases,
} from './core-parity.fixtures.js';
import { prepareCoreRequest } from './actions.js';

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
    expect(missing, `missing parity coverage for: ${missing.join(', ')}`).toEqual([]);
  });

  it('emits no parity cases for action types unknown to the contract', () => {
    const declared = new Set<string>(ALL_CORE_ACTION_TYPES);
    const stray = [...new Set(cases.map((c) => c.expectedAction.type))].filter(
      (t) => !declared.has(t),
    );
    expect(stray, `unknown action types in fixtures: ${stray.join(', ')}`).toEqual([]);
  });

  it('builds a deterministic signing payload for prepared core requests', () => {
    const request = prepareCoreRequest(cases[0].action, 'testnet');

    const payload = buildSigningPayload({
      targetAccount: request.targetAccount,
      publicKey: 'ed25519:test-key',
      nonce: 7,
      expiresAtMs: 1700000000000,
      action: request.action,
    });

    expect(payload).toEqual({
      target_account: 'core.onsocial.testnet',
      public_key: 'ed25519:test-key',
      nonce: '7',
      expires_at_ms: '1700000000000',
      action: {
        data: {
          'profile/bio': 'Builder',
          'profile/name': 'Alice',
          'profile/v': '1',
        },
        type: 'set',
      },
      delegate_action: null,
    });

    const message = new TextDecoder().decode(
      buildSigningMessage(request.targetAccount, payload),
    );

    expect(message.startsWith('onsocial:execute:v1:core.onsocial.testnet')).toBe(true);
    expect(message.includes('"target_account":"core.onsocial.testnet"')).toBe(true);
  });
});
