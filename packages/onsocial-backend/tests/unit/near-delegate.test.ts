import { beforeEach, describe, expect, it, vi } from 'vitest';

const TEST_SECRET_KEY =
  'ed25519:99eUso3aSbE9tqGSTXzo3TLfKb9RkMTURrHKQ1K7Zh3StnzFNUx8FKCPPPPpR479qsw5zv2WNBKmgiz7WqgAJfM';

vi.mock('../../src/logger.js', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}));

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function setDelegateEnv() {
  vi.stubEnv('NODE_ENV', 'test');
  vi.stubEnv('TELEGRAM_BOT_TOKEN', 'test-token');
  vi.stubEnv('RELAYER_URL', 'http://relayer.local');
  vi.stubEnv('RELAYER_API_KEY', 'relayer-api-key');
  vi.stubEnv('NEAR_RPC_URL', 'http://rpc.local');
  vi.stubEnv('REWARDS_CONTRACT', 'rewards.testnet');
  vi.stubEnv('REWARDS_DELEGATE_ACCOUNT', 'backend.testnet');
  vi.stubEnv('REWARDS_DELEGATE_PRIVATE_KEY', TEST_SECRET_KEY);
}

describe('backend rewards delegate relay', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
    setDelegateEnv();
  });

  it('credits rewards through /execute_delegate', async () => {
    const fetchMock = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url === 'http://rpc.local') {
          return jsonResponse({ result: { nonce: 41 } });
        }
        if (url === 'http://relayer.local/latest_block') {
          return jsonResponse({ block_height: 1000 });
        }
        if (url === 'http://relayer.local/execute_delegate?wait=true') {
          const body = JSON.parse(String(init?.body)) as {
            signed_delegate?: string;
          };
          expect(body.signed_delegate).toMatch(/^[A-Za-z0-9+/]+=*$/);
          expect((init?.headers as Record<string, string>)['X-Api-Key']).toBe(
            'relayer-api-key'
          );
          return jsonResponse({
            success: true,
            status: 'committed',
            tx_hash: 'txhash123',
          });
        }
        throw new Error(`unexpected fetch: ${url}`);
      }
    );
    vi.stubGlobal('fetch', fetchMock);

    const { creditOnChain } = await import('../../src/services/near.js');
    const txHash = await creditOnChain(
      'alice.testnet',
      '100000000000000000',
      'telegram:message',
      'onsocial_telegram'
    );

    expect(txHash).toBe('txhash123');
    const urls = fetchMock.mock.calls.map(([input]) => String(input));
    expect(urls).toContain('http://relayer.local/execute_delegate?wait=true');
    expect(urls.some((url) => url.includes('/execute?wait=true'))).toBe(false);
  });

  it('returns claim relayer errors without falling back to direct auth', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === 'http://rpc.local') {
        return jsonResponse({ result: { nonce: 9 } });
      }
      if (url === 'http://relayer.local/latest_block') {
        return jsonResponse({ block_height: 2000 });
      }
      if (url === 'http://relayer.local/execute_delegate?wait=true') {
        return jsonResponse(
          {
            success: false,
            status: 'rejected',
            error: 'Inner receiver not allowed',
          },
          400
        );
      }
      throw new Error(`unexpected fetch: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    const { claimOnChain } = await import('../../src/services/near.js');
    const result = await claimOnChain('alice.testnet');

    expect(result).toEqual({
      success: false,
      error: 'Inner receiver not allowed',
    });
    const urls = fetchMock.mock.calls.map(([input]) => String(input));
    expect(urls).toContain('http://relayer.local/execute_delegate?wait=true');
    expect(urls.some((url) => url.includes('/execute?wait=true'))).toBe(false);
  });
});
