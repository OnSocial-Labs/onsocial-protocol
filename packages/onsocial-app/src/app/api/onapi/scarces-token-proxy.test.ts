import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { ACTIVE_API_URL } from '@/lib/app-config';
import {
  __scarcesTokenFallbackTestHooks,
  SCARCES_TOKEN_GATEWAY_COOL_OFF_MS,
  SCARCES_TOKEN_GATEWAY_FAILURE_THRESHOLD,
} from '@/server/scarces-token-fallback';
import { DELETE, GET, POST } from './[...path]/route';

const ORIGINAL_API_KEY = process.env.ONSOCIAL_API_KEY;
const ORIGINAL_FASTNEAR = process.env.FASTNEAR_API_KEY;
const ORIGINAL_LAVA = process.env.LAVA_API_KEY;
const ORIGINAL_NEAR_RPC = process.env.NEAR_RPC_URL;
const hooks = __scarcesTokenFallbackTestHooks();
const TOKEN = { token_id: 's:15', owner_id: 'alice.testnet' };
const FALLBACK_LOG = 'SCARCES_TOKEN_GATEWAY_FALLBACK';

let warnSpy: ReturnType<typeof vi.spyOn>;
let errorSpy: ReturnType<typeof vi.spyOn>;

function proxyRequest(path: string, search = '', method = 'GET'): NextRequest {
  const url = `http://localhost:3060/api/onapi/${path}${search}`;
  return new NextRequest(url, {
    method,
    headers: { origin: 'http://localhost:3060' },
  });
}

function routeContext(path: string) {
  return { params: Promise.resolve({ path: path.split('/') }) };
}

function tokenBytes(value: unknown): number[] {
  return Array.from(Buffer.from(JSON.stringify(value), 'utf8'));
}

function rpcOk(value: unknown): Response {
  return new Response(
    JSON.stringify({
      jsonrpc: '2.0',
      id: 'onsocial',
      result: { result: tokenBytes(value) },
    }),
    { status: 200, headers: { 'content-type': 'application/json' } }
  );
}

function rpcErr(error: Record<string, unknown>): Response {
  return new Response(
    JSON.stringify({ jsonrpc: '2.0', id: 'onsocial', error }),
    { status: 200, headers: { 'content-type': 'application/json' } }
  );
}

function fallbackLines(): string[] {
  return warnSpy.mock.calls
    .map((call) => call[0])
    .filter(
      (line): line is string =>
        typeof line === 'string' && line.startsWith(FALLBACK_LOG)
    );
}

function restoreEnv(name: string, value: string | undefined) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

describe('OnAPI proxy data/scarces-token', () => {
  beforeEach(() => {
    hooks.reset();
    delete process.env.FASTNEAR_API_KEY;
    delete process.env.LAVA_API_KEY;
    delete process.env.NEAR_RPC_URL;
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    warnSpy.mockRestore();
    errorSpy.mockRestore();
    hooks.reset();
    restoreEnv('ONSOCIAL_API_KEY', ORIGINAL_API_KEY);
    restoreEnv('FASTNEAR_API_KEY', ORIGINAL_FASTNEAR);
    restoreEnv('LAVA_API_KEY', ORIGINAL_LAVA);
    restoreEnv('NEAR_RPC_URL', ORIGINAL_NEAR_RPC);
  });

  it('forwards GET data/scarces-token to the gateway', async () => {
    process.env.ONSOCIAL_API_KEY = 'test-scarces-key';
    const fetchMock = vi.fn(
      async () =>
        new Response(JSON.stringify(TOKEN), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        })
    );
    vi.stubGlobal('fetch', fetchMock);

    const response = await GET(
      proxyRequest('data/scarces-token', '?tokenId=s:15'),
      routeContext('data/scarces-token')
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(TOKEN);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [target, init] = fetchMock.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    const targetUrl = new URL(target);
    expect(targetUrl.origin + targetUrl.pathname).toBe(
      `${ACTIVE_API_URL.replace(/\/$/, '')}/data/scarces-token`
    );
    expect(targetUrl.searchParams.get('tokenId')).toBe('s:15');
    expect(new Headers(init.headers).get('X-API-Key')).toBe('test-scarces-key');
    expect(init.method).toBe('GET');
    expect(fallbackLines()).toHaveLength(0);
  });

  it('forwards a null token from the gateway without a chain read', async () => {
    process.env.ONSOCIAL_API_KEY = 'test-scarces-key';
    const fetchMock = vi.fn(
      async () =>
        new Response('null', {
          status: 200,
          headers: { 'content-type': 'application/json' },
        })
    );
    vi.stubGlobal('fetch', fetchMock);

    const response = await GET(
      proxyRequest('data/scarces-token', '?tokenId=missing'),
      routeContext('data/scarces-token')
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fallbackLines()).toHaveLength(0);
  });

  it('treats the route as allowed even when the server API key is missing', async () => {
    delete process.env.ONSOCIAL_API_KEY;
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const response = await GET(
      proxyRequest('data/scarces-token', '?tokenId=s:15'),
      routeContext('data/scarces-token')
    );

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      error: 'ONSOCIAL_API_KEY is not configured for this app',
    });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(fallbackLines()).toHaveLength(0);
  });

  it('still rejects unknown data routes and non-GET methods', async () => {
    process.env.ONSOCIAL_API_KEY = 'test-scarces-key';
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const unknown = await GET(
      proxyRequest('data/not-a-real-route'),
      routeContext('data/not-a-real-route')
    );
    const posted = await POST(
      proxyRequest('data/scarces-token', '?tokenId=s:15', 'POST'),
      routeContext('data/scarces-token')
    );
    const deleted = await DELETE(
      proxyRequest('data/scarces-token', '?tokenId=s:15', 'DELETE'),
      routeContext('data/scarces-token')
    );

    for (const response of [unknown, posted, deleted]) {
      expect(response.status).toBe(404);
      await expect(response.json()).resolves.toEqual({
        error: 'OnAPI proxy route is not allowed',
      });
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('falls back to a keyed chain read when the gateway is down', async () => {
    process.env.ONSOCIAL_API_KEY = 'test-scarces-key';
    process.env.FASTNEAR_API_KEY = 'test-fastnear-key';
    const fetchMock = vi.fn(async (url: string) => {
      if (String(url).includes('/data/scarces-token')) {
        return new Response(JSON.stringify({ error: 'RPC call failed' }), {
          status: 502,
          headers: { 'content-type': 'application/json' },
        });
      }
      return rpcOk(TOKEN);
    });
    vi.stubGlobal('fetch', fetchMock);

    const response = await GET(
      proxyRequest('data/scarces-token', '?tokenId=s:15'),
      routeContext('data/scarces-token')
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(TOKEN);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const [rpcUrl, rpcInit] = fetchMock.mock.calls[1] as unknown as [
      string,
      RequestInit,
    ];
    const rpc = new URL(rpcUrl);
    expect(rpc.host).toBe('rpc.testnet.fastnear.com');
    expect(rpcUrl).not.toContain('test-fastnear-key');
    expect(new Headers(rpcInit.headers).get('authorization')).toBe(
      'Bearer test-fastnear-key'
    );
    const body = JSON.parse(String(rpcInit.body)) as {
      method: string;
      params: {
        request_type: string;
        account_id: string;
        method_name: string;
        args_base64: string;
      };
    };
    expect(body.method).toBe('query');
    expect(body.params.request_type).toBe('call_function');
    expect(body.params.account_id).toBe('scarces.onsocial.testnet');
    expect(body.params.method_name).toBe('nft_token');
    expect(
      JSON.parse(Buffer.from(body.params.args_base64, 'base64').toString())
    ).toEqual({ token_id: 's:15' });
    expect(fallbackLines()).toHaveLength(1);
    const line = fallbackLines()[0]!;
    expect(line).toContain('"keyed":true');
    expect(line).toContain('"unkeyedPublicRpc":false');
    expect(line).toContain('"outcome":"served"');
    expect(line).not.toContain('test-fastnear-key');
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('falls back to public rpc and logs that the read ran unkeyed', async () => {
    process.env.ONSOCIAL_API_KEY = 'test-scarces-key';
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (String(url).includes('/data/scarces-token')) {
        return new Response('bad gateway', { status: 503 });
      }
      expect(new Headers(init?.headers).get('authorization')).toBeNull();
      return rpcOk(TOKEN);
    });
    vi.stubGlobal('fetch', fetchMock);

    const response = await GET(
      proxyRequest('data/scarces-token', '?tokenId=s:15'),
      routeContext('data/scarces-token')
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(TOKEN);
    const [rpcUrl] = fetchMock.mock.calls[1] as unknown as [string];
    expect(new URL(rpcUrl).host).toBe('test.rpc.fastnear.com');
    expect(fallbackLines()).toHaveLength(1);
    const line = fallbackLines()[0]!;
    expect(line).toContain('"keyed":false');
    expect(line).toContain('"unkeyedPublicRpc":true');
    expect(line).toContain('public rpc without a server rpc key');
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('returns one failure when the gateway and the chain read are both down', async () => {
    process.env.ONSOCIAL_API_KEY = 'test-scarces-key';
    const fetchMock = vi.fn(async (url: string) => {
      if (String(url).includes('/data/scarces-token')) {
        throw new TypeError('fetch failed');
      }
      return new Response('upstream down', { status: 500 });
    });
    vi.stubGlobal('fetch', fetchMock);

    const response = await GET(
      proxyRequest('data/scarces-token', '?tokenId=s:15'),
      routeContext('data/scarces-token')
    );

    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toEqual({
      error: 'OnSocial gateway unreachable',
      detail: 'chain read failed',
    });
    expect(fallbackLines()).toHaveLength(1);
    expect(fallbackLines()[0]).toContain('"outcome":"failed"');
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('does not fall back on token not found', async () => {
    process.env.ONSOCIAL_API_KEY = 'test-scarces-key';
    const fetchMock = vi.fn(async (url: string) => {
      if (String(url).includes('/data/scarces-token')) {
        return new Response(
          JSON.stringify({
            error: 'token not found',
            details: 'token not found',
          }),
          { status: 404, headers: { 'content-type': 'application/json' } }
        );
      }
      throw new Error('chain read should not run');
    });
    vi.stubGlobal('fetch', fetchMock);

    const missing = await GET(
      proxyRequest('data/scarces-token', '?tokenId=missing'),
      routeContext('data/scarces-token')
    );
    expect(missing.status).toBe(404);
    await expect(missing.json()).resolves.toEqual({
      error: 'token not found',
      details: 'token not found',
    });

    fetchMock.mockImplementation(async (url: string) => {
      if (String(url).includes('/data/scarces-token')) {
        return new Response(
          JSON.stringify({
            error: 'RPC call failed',
            details: 'token not found',
          }),
          { status: 502, headers: { 'content-type': 'application/json' } }
        );
      }
      throw new Error('chain read should not run');
    });
    const wrapped = await GET(
      proxyRequest('data/scarces-token', '?tokenId=missing'),
      routeContext('data/scarces-token')
    );
    expect(wrapped.status).toBe(502);
    await expect(wrapped.json()).resolves.toEqual({
      error: 'RPC call failed',
      details: 'token not found',
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fallbackLines()).toHaveLength(0);
  });

  it('does not fall back on a request 4xx', async () => {
    process.env.ONSOCIAL_API_KEY = 'test-scarces-key';
    const fetchMock = vi.fn(
      async () =>
        new Response(
          JSON.stringify({ error: 'Missing required query param: tokenId' }),
          { status: 400, headers: { 'content-type': 'application/json' } }
        )
    );
    vi.stubGlobal('fetch', fetchMock);

    const response = await GET(
      proxyRequest('data/scarces-token', '?tokenId=s:15'),
      routeContext('data/scarces-token')
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: 'Missing required query param: tokenId',
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fallbackLines()).toHaveLength(0);
  });

  it('does not fall back when the chain says the contract account is unknown', async () => {
    process.env.ONSOCIAL_API_KEY = 'test-scarces-key';
    const gatewayBody = { error: 'RPC call failed', details: 'upstream' };
    const fetchMock = vi.fn(async (url: string) => {
      if (String(url).includes('/data/scarces-token')) {
        return new Response(JSON.stringify(gatewayBody), {
          status: 502,
          headers: { 'content-type': 'application/json' },
        });
      }
      return rpcErr({
        code: -32000,
        message: "Server error: account scarces.onsocial.testnet doesn't exist",
        cause: { name: 'UNKNOWN_ACCOUNT' },
      });
    });
    vi.stubGlobal('fetch', fetchMock);

    const response = await GET(
      proxyRequest('data/scarces-token', '?tokenId=s:15'),
      routeContext('data/scarces-token')
    );

    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toEqual(gatewayBody);
    expect(fallbackLines()).toHaveLength(1);
    expect(fallbackLines()[0]).toContain('"failure":"unknown_account"');
    expect(fallbackLines()[0]).not.toContain('"outcome":"empty"');
  });

  it('returns null when the chain read says the token does not exist', async () => {
    process.env.ONSOCIAL_API_KEY = 'test-scarces-key';
    const fetchMock = vi.fn(async (url: string) => {
      if (String(url).includes('/data/scarces-token')) {
        return new Response('gateway down', { status: 504 });
      }
      return rpcOk(null);
    });
    vi.stubGlobal('fetch', fetchMock);

    const response = await GET(
      proxyRequest('data/scarces-token', '?tokenId=missing'),
      routeContext('data/scarces-token')
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toBeNull();
    expect(fallbackLines()).toHaveLength(1);
    expect(fallbackLines()[0]).toContain('"outcome":"empty"');
  });

  it('falls back once when the gateway call times out', async () => {
    process.env.ONSOCIAL_API_KEY = 'test-scarces-key';
    const fetchMock = vi.fn(async (url: string) => {
      if (String(url).includes('/data/scarces-token')) {
        throw new DOMException(
          'The operation was aborted due to timeout',
          'TimeoutError'
        );
      }
      return rpcOk(TOKEN);
    });
    vi.stubGlobal('fetch', fetchMock);

    const response = await GET(
      proxyRequest('data/scarces-token', '?tokenId=s:15'),
      routeContext('data/scarces-token')
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(TOKEN);
    expect(fallbackLines()).toHaveLength(1);
    expect(fallbackLines()[0]).toContain('"reason":"timeout"');
  });

  it('skips the gateway during cool-off and tries it again when the window ends', async () => {
    process.env.ONSOCIAL_API_KEY = 'test-scarces-key';
    const start = 1_700_000_000_000;
    hooks.setNow(() => start);
    let gatewayCalls = 0;
    const fetchMock = vi.fn(async (url: string) => {
      if (String(url).includes('/data/scarces-token')) {
        gatewayCalls += 1;
        return new Response('down', { status: 503 });
      }
      return rpcOk(TOKEN);
    });
    vi.stubGlobal('fetch', fetchMock);

    for (let i = 0; i < SCARCES_TOKEN_GATEWAY_FAILURE_THRESHOLD; i += 1) {
      const response = await GET(
        proxyRequest('data/scarces-token', '?tokenId=s:15'),
        routeContext('data/scarces-token')
      );
      expect(response.status).toBe(200);
    }
    expect(gatewayCalls).toBe(SCARCES_TOKEN_GATEWAY_FAILURE_THRESHOLD);

    const cooled = await GET(
      proxyRequest('data/scarces-token', '?tokenId=s:15'),
      routeContext('data/scarces-token')
    );
    expect(cooled.status).toBe(200);
    await expect(cooled.json()).resolves.toEqual(TOKEN);
    expect(gatewayCalls).toBe(SCARCES_TOKEN_GATEWAY_FAILURE_THRESHOLD);
    expect(fallbackLines().at(-1)).toContain('"reason":"cool_off"');

    hooks.setNow(() => start + SCARCES_TOKEN_GATEWAY_COOL_OFF_MS);
    const reopened = await GET(
      proxyRequest('data/scarces-token', '?tokenId=s:15'),
      routeContext('data/scarces-token')
    );
    expect(reopened.status).toBe(200);
    expect(gatewayCalls).toBe(SCARCES_TOKEN_GATEWAY_FAILURE_THRESHOLD + 1);
  });

  it('does not chain-read other gateway routes when they fail', async () => {
    process.env.ONSOCIAL_API_KEY = 'test-scarces-key';
    let calledUrl = '';
    const fetchMock = vi.fn(async (url: string) => {
      calledUrl = url;
      return new Response('no', { status: 502 });
    });
    vi.stubGlobal('fetch', fetchMock);

    const response = await GET(
      proxyRequest('data/get', '?keys=profile/name'),
      routeContext('data/get')
    );

    expect(response.status).toBe(502);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(calledUrl).toContain('/data/get');
    expect(fallbackLines()).toHaveLength(0);
  });
});
