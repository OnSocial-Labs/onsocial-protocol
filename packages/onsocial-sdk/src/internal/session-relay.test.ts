import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RelayExecutionError } from './http.js';
import {
  __resetSessionRelayQueues,
  isDelegateNonceError,
  parseDelegateNextNonce,
  runSerializedSessionRelay,
} from './session-relay.js';
import { Session } from '../advanced/session.js';

beforeEach(() => {
  __resetSessionRelayQueues();
});

function makeSession(): Session {
  return new Session({
    network: 'testnet',
    accountId: 'alice.testnet',
    contract: 'core',
    contractId: 'core.onsocial.testnet',
    key: {
      publicKey: 'ed25519:11111111111111111111111111111111111111111111111111',
      sign: async () => new Uint8Array(64),
    },
    startingNonce: 10,
  });
}

describe('session-relay helpers', () => {
  it('detects delegate invalid nonce failures', () => {
    const error = new RelayExecutionError(
      'ActionError(ActionError { kind: DelegateActionInvalidNonce { delegate_nonce: 3, ak_nonce: 4 } })',
      'HASH',
      { error: 'ActionError...' }
    );
    expect(isDelegateNonceError(error)).toBe(true);
    expect(parseDelegateNextNonce(error)).toBe(4);
  });

  it('serializes relay work per session key', async () => {
    const session = makeSession();
    const order: number[] = [];

    const first = runSerializedSessionRelay(session, async () => {
      order.push(1);
      await new Promise((resolve) => setTimeout(resolve, 30));
      order.push(2);
    });
    const second = runSerializedSessionRelay(session, async () => {
      order.push(3);
    });

    await Promise.all([first, second]);
    expect(order).toEqual([1, 2, 3]);
  });
});
