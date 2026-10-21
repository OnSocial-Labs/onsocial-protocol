import { describe, expect, it, vi } from 'vitest';
import { OnSocial } from '../client.js';
import { OnSocialError } from '../internal/http.js';
import { RpcError } from './rpc.js';

function jsonFetch(body: unknown, status = 200) {
  return vi.fn(
    async () =>
      new Response(JSON.stringify(body), {
        status,
        headers: { 'content-type': 'application/json' },
      })
  );
}

describe('os.rpc', () => {
  it('posts one JSON-RPC call to the testnet host with the OnAPI key', async () => {
    const fetch = jsonFetch({
      jsonrpc: '2.0',
      id: 'onsocial',
      result: { amount: '1' },
    });
    const os = new OnSocial({
      network: 'testnet',
      apiKey: 'onsocial_test',
      fetch,
    });

    const result = await os.rpc.call('query', {
      request_type: 'view_account',
      finality: 'final',
      account_id: 'test.near',
    });

    expect(result).toEqual({ amount: '1' });
    expect(os.rpc.url).toBe('https://testnet.onsocial.id/v1/rpc');
    expect(fetch).toHaveBeenCalledOnce();
    const [url, init] = fetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://testnet.onsocial.id/v1/rpc');
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>)['X-API-Key']).toBe(
      'onsocial_test'
    );
    expect(JSON.parse(String(init.body))).toEqual({
      jsonrpc: '2.0',
      id: 'onsocial',
      method: 'query',
      params: {
        request_type: 'view_account',
        finality: 'final',
        account_id: 'test.near',
      },
    });
  });

  it('throws RpcError when the gateway returns a JSON-RPC error', async () => {
    const fetch = jsonFetch({
      jsonrpc: '2.0',
      id: 'onsocial',
      error: { code: -32001, message: 'Archival RPC is a paid OnAPI tier.' },
    });
    const os = new OnSocial({
      network: 'testnet',
      apiKey: 'onsocial_test',
      fetch,
    });

    await expect(os.rpc.call('block', { block_id: 1 })).rejects.toBeInstanceOf(
      RpcError
    );
  });

  it('turns the same client into near-api-js provider options', () => {
    const os = new OnSocial({
      network: 'testnet',
      apiKey: 'onsocial_test',
    });

    expect(os.rpc.nearProvider()).toEqual({
      url: 'https://testnet.onsocial.id/v1/rpc',
      headers: { 'X-API-Key': 'onsocial_test' },
    });
  });

  it('surfaces an HTTP failure as OnSocialError', async () => {
    const fetch = jsonFetch({ error: 'Authentication required' }, 401);
    const os = new OnSocial({ network: 'testnet', fetch });

    await expect(os.rpc.call('status')).rejects.toBeInstanceOf(OnSocialError);
  });
});
