import { afterEach, describe, expect, it, vi } from 'vitest';
import { HttpClient, OnSocialError } from '../../internal/http.js';
import { ScarcesTokensApi } from './tokens.js';

function client(
  fetchImpl: (input: string, init?: RequestInit) => Promise<Response>
) {
  return new ScarcesTokensApi(
    new HttpClient({
      fetch: fetchImpl as typeof fetch,
      gatewayUrl: 'https://gateway.test',
      network: 'testnet',
    }),
    () => {
      throw new Error('session is not used by get');
    }
  );
}

describe('ScarcesTokensApi.get', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns the gateway body and does not call a public chain RPC', async () => {
    const gateway = vi.fn(async (url: string) => {
      expect(url).toContain('/data/scarces-token?tokenId=s%3A1');
      return new Response(
        JSON.stringify({ token_id: 's:1', owner_id: 'alice.testnet' }),
        { status: 200, headers: { 'content-type': 'application/json' } }
      );
    });
    const publicFetch = vi.spyOn(globalThis, 'fetch');
    const token = await client(gateway).get('s:1');

    expect(token).toEqual({ token_id: 's:1', owner_id: 'alice.testnet' });
    expect(gateway).toHaveBeenCalledTimes(1);
    expect(publicFetch).not.toHaveBeenCalled();
  });

  it.each([404, 400, 502, 503, 504])(
    'does not retry a public chain RPC on HTTP %s',
    async (status) => {
      const gateway = vi.fn(
        async () =>
          new Response(JSON.stringify({ error: `HTTP ${status}` }), {
            status,
            headers: { 'content-type': 'application/json' },
          })
      );
      const publicFetch = vi.spyOn(globalThis, 'fetch');

      await expect(client(gateway).get('s:1')).rejects.toBeInstanceOf(
        OnSocialError
      );
      expect(gateway).toHaveBeenCalledTimes(1);
      expect(publicFetch).not.toHaveBeenCalled();
    }
  );
});
