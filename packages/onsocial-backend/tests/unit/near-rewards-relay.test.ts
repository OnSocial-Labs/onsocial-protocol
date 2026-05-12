import { beforeEach, describe, expect, it, vi } from 'vitest';

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

function setRewardsRelayEnv() {
  vi.stubEnv('NODE_ENV', 'test');
  vi.stubEnv('TELEGRAM_BOT_TOKEN', 'test-token');
  vi.stubEnv('RELAYER_URL', 'http://relayer.local');
  vi.stubEnv('RELAYER_API_KEY', 'relayer-api-key');
  vi.stubEnv('NEAR_RPC_URL', 'http://rpc.local');
  vi.stubEnv('REWARDS_CONTRACT', 'rewards.testnet');
}

describe('backend rewards service relay', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
    setRewardsRelayEnv();
  });

  it('credits rewards through /execute_rewards', async () => {
    const fetchMock = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url === 'http://relayer.local/execute_rewards?wait=true') {
          const body = JSON.parse(String(init?.body)) as {
            action?: Record<string, unknown>;
          };
          expect(body).toEqual({
            action: {
              type: 'credit_reward',
              account_id: 'alice.testnet',
              amount: '100000000000000000',
              source: 'telegram:message',
              app_id: 'onsocial_telegram',
            },
          });
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
    expect(urls).toContain('http://relayer.local/execute_rewards?wait=true');
    expect(urls.some((url) => url.includes('/execute_delegate'))).toBe(false);
    expect(urls.some((url) => url.includes('/execute?wait=true'))).toBe(false);
  });

  it('returns claim relayer errors without local signing fallback', async () => {
    const fetchMock = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url === 'http://relayer.local/execute_rewards?wait=true') {
          const body = JSON.parse(String(init?.body)) as {
            action?: Record<string, unknown>;
          };
          expect(body).toEqual({
            action: {
              type: 'claim',
              account_id: 'alice.testnet',
            },
          });
          return jsonResponse(
            {
              success: false,
              status: 'rejected',
              error: 'Relayer rewards contract is not allowlisted',
            },
            500
          );
        }
        throw new Error(`unexpected fetch: ${url}`);
      }
    );
    vi.stubGlobal('fetch', fetchMock);

    const { claimOnChain } = await import('../../src/services/near.js');
    const result = await claimOnChain('alice.testnet');

    expect(result).toEqual({
      success: false,
      error: 'Relayer rewards contract is not allowlisted',
    });
    const urls = fetchMock.mock.calls.map(([input]) => String(input));
    expect(urls).toContain('http://relayer.local/execute_rewards?wait=true');
    expect(urls.some((url) => url.includes('/execute_delegate'))).toBe(false);
    expect(urls.some((url) => url.includes('/execute?wait=true'))).toBe(false);
  });
});
