/**
 * Reads keep per-provider retry and failover.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createNearRpc,
  NearRpcSendError,
  type NearRpcEndpoint,
} from '@onsocial/rpc';

const endpoints: NearRpcEndpoint[] = [
  { url: 'http://127.0.0.1:4011/one' },
  { url: 'http://127.0.0.1:4011/two' },
  { url: 'http://127.0.0.1:4011/three' },
];

const READ_ATTEMPTS = 3;

function client(overrides?: { timeoutMs?: number; maxRetries?: number }) {
  return createNearRpc({
    network: 'testnet',
    primaryUrl: endpoints[0].url,
    endpoints,
    timeoutMs: overrides?.timeoutMs ?? 20,
    baseDelayMs: 0,
    ...(overrides?.maxRetries == null
      ? {}
      : { maxRetries: overrides.maxRetries }),
  });
}

function urlsOf(fetchMock: ReturnType<typeof vi.fn>): string[] {
  return fetchMock.mock.calls.map((call) => String(call[0]));
}

function okResult(): Response {
  return new Response(
    JSON.stringify({
      jsonrpc: '2.0',
      id: 'onsocial',
      result: { amount: '1' },
    }),
    { status: 200, headers: { 'content-type': 'application/json' } }
  );
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
    if (!signal || signal.aborted) {
      abort();
      return;
    }
    signal.addEventListener('abort', abort, { once: true });
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('read retry and failover', () => {
  it('retries a timed-out query on the first provider, then uses the next', async () => {
    const fetchMock = vi.fn(async (url: unknown, init?: RequestInit) => {
      if (String(url) === endpoints[0].url) return hangUntilAbort(init);
      return okResult();
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await client().call('query', {
      request_type: 'view_account',
      finality: 'final',
      account_id: 'alice.testnet',
    });

    expect(result.result).toEqual({ amount: '1' });
    const urls = urlsOf(fetchMock);
    expect(urls.filter((url) => url === endpoints[0].url)).toHaveLength(
      READ_ATTEMPTS
    );
    expect(urls.at(-1)).toBe(endpoints[1].url);
    expect(urls).not.toContain(endpoints[2].url);
  });

  it('retries a 5xx status read, then fails over', async () => {
    const fetchMock = vi.fn(async (url: unknown) => {
      if (String(url) === endpoints[0].url) {
        return new Response('down', { status: 502, statusText: 'Bad Gateway' });
      }
      return okResult();
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await client().call('status', []);

    expect(result.result).toEqual({ amount: '1' });
    const urls = urlsOf(fetchMock);
    expect(urls.filter((url) => url === endpoints[0].url)).toHaveLength(
      READ_ATTEMPTS
    );
    expect(urls.at(-1)).toBe(endpoints[1].url);
  });

  it('retries tx status the same way', async () => {
    const fetchMock = vi.fn(async (url: unknown) => {
      if (String(url) === endpoints[0].url) {
        return new Response('down', { status: 500, statusText: 'Error' });
      }
      return okResult();
    });
    vi.stubGlobal('fetch', fetchMock);

    await client().call('tx', ['hash', 'alice.testnet']);

    expect(
      urlsOf(fetchMock).filter((url) => url === endpoints[0].url)
    ).toHaveLength(READ_ATTEMPTS);
  });

  it('fails a rate-limited read over immediately', async () => {
    const fetchMock = vi.fn(async (url: unknown) => {
      if (String(url) === endpoints[0].url) {
        return new Response('slow down', { status: 429 });
      }
      return okResult();
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await client().call('block', { finality: 'final' });

    expect(result.result).toEqual({ amount: '1' });
    expect(urlsOf(fetchMock)).toEqual([endpoints[0].url, endpoints[1].url]);
  });

  it('still honours a lower read retry count before failover', async () => {
    const fetchMock = vi.fn(async (url: unknown) => {
      if (String(url) === endpoints[0].url) {
        throw new TypeError('failed to fetch');
      }
      return okResult();
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await client({ maxRetries: 0 }).call('gas_price', [null]);

    expect(result.result).toEqual({ amount: '1' });
    expect(urlsOf(fetchMock)).toEqual([endpoints[0].url, endpoints[1].url]);
  });

  it('throws the existing read error when every provider fails', async () => {
    const fetchMock = vi.fn(async () => {
      throw new TypeError('failed to fetch');
    });
    vi.stubGlobal('fetch', fetchMock);
    const rpc = client({ maxRetries: 0 });

    const error = await rpc.call('query', {}).then(
      () => null,
      (err: unknown) => err
    );

    expect(error).toBeInstanceOf(Error);
    expect(error).not.toBeInstanceOf(NearRpcSendError);
    expect((error as Error).message).toMatch(/All NEAR RPC providers failed/);
    expect(urlsOf(fetchMock)).toEqual([
      endpoints[0].url,
      endpoints[1].url,
      endpoints[2].url,
    ]);
  });
});
