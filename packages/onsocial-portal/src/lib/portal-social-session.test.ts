import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/welcome-near', () => ({
  requestWelcomeNearIfNeeded: vi.fn(async () => {}),
}));

vi.mock('@/lib/near-rpc', () => ({
  viewFunctionCallAccessKey: vi.fn(async () => ({
    receiverId: 'core.onsocial.testnet',
    methodNames: ['execute'],
    allowanceYocto: '250000000000000000000000',
  })),
}));

vi.mock('@onsocial/sdk/advanced', () => ({
  generateEd25519Key: vi.fn(),
  localStorageKeyStore: vi.fn(() => ({
    get: vi.fn(async () => null),
    delete: vi.fn(async () => {}),
  })),
  persistSessionFromKey: vi.fn(async () => ({ id: 'session' })),
  resolveContractId: vi.fn(() => 'core.onsocial.testnet'),
  restoreSession: vi.fn(async () => null),
  sessionId: vi.fn(() => 'sid'),
}));

import { requestWelcomeNearIfNeeded } from '@/lib/welcome-near';
import { finishPortalSessionLogin } from '@/lib/portal-social-session';

const pendingKey = {
  publicKey: 'ed25519:abc',
  secretSeedB64u: 'e30',
  sign: () => {
    throw new Error('unused');
  },
};

describe('finishPortalSessionLogin', () => {
  beforeEach(() => {
    vi.mocked(requestWelcomeNearIfNeeded).mockClear();
  });

  it('prompts the wallet after the gift, then confirms the key on chain', async () => {
    const events: string[] = [];
    vi.mocked(requestWelcomeNearIfNeeded).mockImplementation(async () => {
      events.push('welcome');
    });

    await finishPortalSessionLogin(
      'alice.testnet',
      pendingKey,
      Promise.resolve(),
      async () => {
        events.push('connect');
        return {} as never;
      },
      {
        onWalletPrompt: () => {
          events.push('wallet');
        },
        onConfirming: () => {
          events.push('confirming');
        },
      }
    );

    expect(events).toEqual(['welcome', 'wallet', 'connect', 'confirming']);
    expect(requestWelcomeNearIfNeeded).toHaveBeenCalledWith('alice.testnet');
  });
});
