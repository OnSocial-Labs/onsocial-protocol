import { afterEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { ACTIVE_API_URL } from '@/lib/app-config';
import { DELETE, GET, POST } from './[...path]/route';

const ORIGINAL_API_KEY = process.env.ONSOCIAL_API_KEY;

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

describe('OnAPI proxy data/scarces-token', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    if (ORIGINAL_API_KEY === undefined) {
      delete process.env.ONSOCIAL_API_KEY;
    } else {
      process.env.ONSOCIAL_API_KEY = ORIGINAL_API_KEY;
    }
  });

  it('forwards GET data/scarces-token to the gateway', async () => {
    process.env.ONSOCIAL_API_KEY = 'test-scarces-key';
    const fetchMock = vi.fn(
      async () =>
        new Response(
          JSON.stringify({ token_id: 's:15', owner_id: 'alice.testnet' }),
          {
            status: 200,
            headers: { 'content-type': 'application/json' },
          }
        )
    );
    vi.stubGlobal('fetch', fetchMock);

    const response = await GET(
      proxyRequest('data/scarces-token', '?tokenId=s:15'),
      routeContext('data/scarces-token')
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      token_id: 's:15',
      owner_id: 'alice.testnet',
    });
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
});
