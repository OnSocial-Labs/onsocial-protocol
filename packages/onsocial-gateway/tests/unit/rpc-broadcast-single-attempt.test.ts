/**
 * A broadcast is one upstream attempt. No retry, no failover.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createNearRpc,
  isSendNearRpcMethod,
  NearRpcSendError,
  type NearRpc,
  type NearRpcEndpoint,
} from '@onsocial/rpc';

const endpoints: NearRpcEndpoint[] = [
  { url: 'http://127.0.0.1:4010/one' },
  { url: 'http://127.0.0.1:4010/two' },
  { url: 'http://127.0.0.1:4010/three' },
];

function client(timeoutMs = 5_000): NearRpc {
  return createNearRpc({
    network: 'testnet',
    primaryUrl: endpoints[0].url,
    endpoints,
    timeoutMs,
    baseDelayMs: 0,
  });
}

function urlsOf(fetchMock: ReturnType<typeof vi.fn>): string[] {
  return fetchMock.mock.calls.map((call) => String(call[0]));
}

function jsonResponse(
  status: number,
  body: unknown,
  headers?: Record<string, string>
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  });
}

function hangUntilAbort(init?: RequestInit): Promise<Response> {
  return new Promise((_resolve, reject) => {
    const signal = init?.signal;
    const abort = () =>
      reject(
        Object.assign(new Error('This operation was aborted'), {
          name: 'AbortError',
        })
      );
    if (!signal) {
      abort();
      return;
    }
    if (signal.aborted) abort();
    else signal.addEventListener('abort', abort, { once: true });
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('isSendNearRpcMethod', () => {
  it('matches submits and leaves reads alone', () => {
    expect(isSendNearRpcMethod('send_tx')).toBe(true);
    expect(isSendNearRpcMethod('broadcast_tx_async')).toBe(true);
    expect(isSendNearRpcMethod('broadcast_tx_commit')).toBe(true);
    expect(isSendNearRpcMethod('broadcast_tx_sync')).toBe(true);
    expect(isSendNearRpcMethod('tx')).toBe(false);
    expect(isSendNearRpcMethod('query')).toBe(false);
    expect(isSendNearRpcMethod('status')).toBe(false);
  });
});

describe('broadcast single attempt', () => {
  it('hits the first provider once on HTTP 429 and does not fail over', async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse(429, { error: 'slow down' }, { 'Retry-After': '15' })
    );
    vi.stubGlobal('fetch', fetchMock);
    const rpc = client();

    await expect(
      rpc.call('broadcast_tx_commit', ['signed'])
    ).rejects.toMatchObject({
      name: 'NearRpcSendError',
      kind: 'rate_limited',
      retryAfterSeconds: 15,
    });

    expect(urlsOf(fetchMock)).toEqual([endpoints[0].url]);
    expect(rpc.getActiveUrl()).toBe(endpoints[1].url);
  });

  it('uses the next provider on a later send, still only once', async () => {
    const fetchMock = vi.fn(async () => jsonResponse(429, {}));
    vi.stubGlobal('fetch', fetchMock);
    const rpc = client();

    await expect(
      rpc.call('broadcast_tx_async', ['signed'])
    ).rejects.toBeInstanceOf(NearRpcSendError);
    await expect(
      rpc.call('send_tx', { signed_tx_base64: 'aa' })
    ).rejects.toMatchObject({
      kind: 'rate_limited',
      retryAfterSeconds: 1,
    });

    expect(urlsOf(fetchMock)).toEqual([endpoints[0].url, endpoints[1].url]);
    expect(rpc.getActiveUrl()).toBe(endpoints[2].url);
  });

  it('clamps Retry-After and defaults when the header is missing or invalid', async () => {
    const cases: Array<{ header?: string; expected: number }> = [
      { header: '0', expected: 1 },
      { header: '90', expected: 60 },
      { header: '2.2', expected: 3 },
      { header: '  12 ', expected: 12 },
      { header: 'nope', expected: 1 },
      { expected: 1 },
    ];

    for (const item of cases) {
      const fetchMock = vi.fn(async () =>
        jsonResponse(
          429,
          {},
          item.header == null ? undefined : { 'Retry-After': item.header }
        )
      );
      vi.stubGlobal('fetch', fetchMock);
      const rpc = client();
      await expect(
        rpc.call('broadcast_tx_commit', ['signed'])
      ).rejects.toMatchObject({
        kind: 'rate_limited',
        retryAfterSeconds: item.expected,
      });
      expect(fetchMock).toHaveBeenCalledOnce();
    }
  });

  it('reads an HTTP-date Retry-After and clamps it', async () => {
    const now = 1_700_000_000_000;
    vi.spyOn(Date, 'now').mockReturnValue(now);
    const future = new Date(now + 45_000).toUTCString();
    const past = new Date(now - 10_000).toUTCString();

    const futureFetch = vi.fn(async () =>
      jsonResponse(429, {}, { 'Retry-After': future })
    );
    vi.stubGlobal('fetch', futureFetch);
    await expect(
      client().call('broadcast_tx_commit', ['signed'])
    ).rejects.toMatchObject({ retryAfterSeconds: 45 });

    const pastFetch = vi.fn(async () =>
      jsonResponse(429, {}, { 'Retry-After': past })
    );
    vi.stubGlobal('fetch', pastFetch);
    await expect(
      client().call('broadcast_tx_async', ['signed'])
    ).rejects.toMatchObject({ retryAfterSeconds: 1 });

    expect(futureFetch).toHaveBeenCalledOnce();
    expect(pastFetch).toHaveBeenCalledOnce();
  });

  it('treats a JSON-RPC rate-limit code as rate limited, once', async () => {
    for (const code of [-429, 429]) {
      const fetchMock = vi.fn(async () =>
        jsonResponse(200, {
          jsonrpc: '2.0',
          id: 'onsocial',
          error: { code, message: 'too many' },
        })
      );
      vi.stubGlobal('fetch', fetchMock);
      await expect(
        client().call('broadcast_tx_sync', ['signed'])
      ).rejects.toMatchObject({
        kind: 'rate_limited',
        retryAfterSeconds: 1,
      });
      expect(urlsOf(fetchMock)).toEqual([endpoints[0].url]);
    }
  });

  it('hits the first provider once on HTTP 500', async () => {
    const fetchMock = vi.fn(
      async () => new Response('down', { status: 500, statusText: 'Error' })
    );
    vi.stubGlobal('fetch', fetchMock);
    const rpc = client();

    await expect(
      rpc.call('broadcast_tx_commit', ['signed'])
    ).rejects.toMatchObject({
      kind: 'unavailable',
      retryAfterSeconds: 1,
    });
    expect(urlsOf(fetchMock)).toEqual([endpoints[0].url]);
    expect(rpc.getActiveUrl()).toBe(endpoints[0].url);
  });

  it('hits the first provider once on a timeout', async () => {
    const fetchMock = vi.fn(async (_url: unknown, init?: RequestInit) =>
      hangUntilAbort(init)
    );
    vi.stubGlobal('fetch', fetchMock);
    const rpc = client(20);

    await expect(
      rpc.call('broadcast_tx_commit', ['signed'])
    ).rejects.toMatchObject({ kind: 'unavailable' });
    expect(urlsOf(fetchMock)).toEqual([endpoints[0].url]);
    expect(rpc.getActiveUrl()).toBe(endpoints[0].url);
  });

  it('hits the first provider once on a network error', async () => {
    const fetchMock = vi.fn(async () => {
      throw new TypeError('failed to fetch');
    });
    vi.stubGlobal('fetch', fetchMock);
    const rpc = client();

    await expect(
      rpc.call('broadcast_tx_async', ['signed'])
    ).rejects.toMatchObject({ kind: 'unavailable' });
    expect(urlsOf(fetchMock)).toEqual([endpoints[0].url]);
    expect(rpc.getActiveUrl()).toBe(endpoints[0].url);
  });

  it('returns other JSON-RPC errors as-is, including a timeout cause', async () => {
    const invalid = vi.fn(async () =>
      jsonResponse(200, {
        jsonrpc: '2.0',
        id: 'onsocial',
        error: { code: -32000, message: 'InvalidTransaction' },
      })
    );
    vi.stubGlobal('fetch', invalid);
    const invalidRpc = client();
    await expect(
      invalidRpc.call('broadcast_tx_commit', ['signed'])
    ).resolves.toMatchObject({
      error: { message: 'InvalidTransaction' },
    });
    expect(urlsOf(invalid)).toEqual([endpoints[0].url]);
    expect(invalidRpc.getActiveUrl()).toBe(endpoints[0].url);

    const timedOut = vi.fn(async () =>
      jsonResponse(200, {
        jsonrpc: '2.0',
        id: 'onsocial',
        error: {
          code: -32000,
          message: 'Server error',
          cause: { name: 'TIMEOUT' },
        },
      })
    );
    vi.stubGlobal('fetch', timedOut);
    const timeoutRpc = client();
    await expect(
      timeoutRpc.call('broadcast_tx_commit', ['signed'])
    ).resolves.toMatchObject({
      error: { cause: { name: 'TIMEOUT' } },
    });
    expect(urlsOf(timedOut)).toEqual([endpoints[0].url]);
    expect(timeoutRpc.getActiveUrl()).toBe(endpoints[0].url);
  });

  it('returns a non-ok JSON-RPC error body instead of failing over', async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse(400, {
        jsonrpc: '2.0',
        id: 'onsocial',
        error: { code: -32602, message: 'Invalid params' },
      })
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      client().call('broadcast_tx_commit', ['signed'])
    ).resolves.toMatchObject({
      error: { message: 'Invalid params' },
    });
    expect(urlsOf(fetchMock)).toEqual([endpoints[0].url]);
  });
});
