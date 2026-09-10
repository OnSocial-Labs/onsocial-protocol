import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  E2E_AUTH_SESSION_KEY,
  E2E_MOCK_SIGNER_ERROR,
  E2E_MOCK_SIGNER_KEY,
  createE2eMockWallet,
  readE2eAuthSessionEnabled,
  readE2eMockSignerEnabled,
} from './e2e-mock-signer';

describe('readE2eMockSignerEnabled', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('stays off in production without the paint flag', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('NEXT_PUBLIC_E2E_WALLET', '');
    expect(readE2eMockSignerEnabled()).toBe(false);
  });

  it('turns on when paint is allowed and the localStorage flag is set', () => {
    vi.stubEnv('NODE_ENV', 'test');
    vi.stubGlobal('window', {
      localStorage: {
        getItem: (key: string) => (key === E2E_MOCK_SIGNER_KEY ? '1' : null),
      },
    });
    expect(readE2eMockSignerEnabled()).toBe(true);
  });
});

describe('readE2eAuthSessionEnabled', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('turns on only for the E2E auth-session flag', () => {
    vi.stubEnv('NODE_ENV', 'test');
    vi.stubGlobal('window', {
      localStorage: {
        getItem: (key: string) => (key === E2E_AUTH_SESSION_KEY ? '1' : null),
      },
    });
    expect(readE2eAuthSessionEnabled()).toBe(true);
  });
});

describe('createE2eMockWallet', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('records the FunctionCall then refuses to broadcast', async () => {
    vi.stubGlobal('window', { __onsocialE2eSignerCalls: [] });
    const wallet = createE2eMockWallet('visitor.testnet');
    await expect(
      wallet.signAndSendTransaction({
        receiverId: 'core.testnet',
        actions: [
          {
            type: 'FunctionCall',
            params: {
              methodName: 'execute',
              args: { e2eVerb: 'set' },
            },
          },
        ],
      } as never)
    ).rejects.toThrow(E2E_MOCK_SIGNER_ERROR);
    expect(window.__onsocialE2eSignerCalls).toEqual([
      {
        receiverId: 'core.testnet',
        methodName: 'execute',
        args: { e2eVerb: 'set' },
      },
    ]);
    expect(E2E_MOCK_SIGNER_KEY).toBe('onsocial.e2e.mockSigner');
  });
});
