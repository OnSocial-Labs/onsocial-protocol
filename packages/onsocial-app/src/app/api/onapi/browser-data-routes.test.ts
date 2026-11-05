import { afterEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { DELETE, GET, POST } from './[...path]/route';
import { collectSdkDataRouteUsage } from './browser-data-routes';

const ORIGINAL_API_KEY = process.env.ONSOCIAL_API_KEY;

function proxyRequest(path: string, method = 'GET'): NextRequest {
  return new NextRequest(`http://localhost:3060/api/onapi/${path}`, {
    method,
    headers: { origin: 'http://localhost:3060' },
  });
}

function routeContext(path: string) {
  return { params: Promise.resolve({ path: path.split('/') }) };
}

describe('browser sdk data routes stay on the OnAPI proxy allowlist', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    if (ORIGINAL_API_KEY === undefined) delete process.env.ONSOCIAL_API_KEY;
    else process.env.ONSOCIAL_API_KEY = ORIGINAL_API_KEY;
  });

  it('fails when app code reaches a data route the proxy does not allow', async () => {
    process.env.ONSOCIAL_API_KEY = 'test-proxy-key';
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('{}', { status: 200 }))
    );

    const usage = collectSdkDataRouteUsage();
    const reached = usage.filter((route) => route.browser.length > 0);
    const reachedPaths = reached.map((route) => route.path);

    // Canaries for the three ways a data route leaves the browser: a direct
    // SDK call, a client passed into a helper, and a proxy fetch by path.
    expect(reachedPaths).toContain('data/ft-metadata');
    expect(reachedPaths).toContain('data/group-is-blacklisted');
    expect(reachedPaths).toContain('data/boost-stats');

    const missing: Array<{
      http: string;
      path: string;
      evidence: (typeof reached)[number]['browser'];
    }> = [];
    for (const route of reached) {
      const handler =
        route.http === 'POST' ? POST : route.http === 'DELETE' ? DELETE : GET;
      const response = await handler(
        proxyRequest(route.path, route.http),
        routeContext(route.path)
      );
      if (response.status === 404) {
        missing.push({
          http: route.http,
          path: route.path,
          evidence: route.browser,
        });
      }
    }

    expect(missing).toEqual([]);
  }, 30_000);
});
