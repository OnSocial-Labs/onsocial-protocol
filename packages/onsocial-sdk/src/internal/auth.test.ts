import { describe, expect, it, vi } from 'vitest';
import { HttpClient } from './http.js';
import { AuthModule } from './auth.js';

describe('AuthModule.completeAppHandoff', () => {
  it('exchanges code + appId and stores the app-scoped JWT', async () => {
    const fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          token: 'app.jwt.token',
          accountId: 'bob.testnet',
          appId: 'tracker',
          expiresIn: '1h',
          tier: 'free',
          rateLimit: 60,
        }),
    });
    const http = new HttpClient({
      fetch,
      gatewayUrl: 'https://testnet.onsocial.id',
    });
    const auth = new AuthModule(http);

    const session = await auth.completeAppHandoff({
      code: 'abc',
      appId: 'Tracker',
    });

    expect(session.appId).toBe('tracker');
    expect(session.token).toBe('app.jwt.token');
    expect(session.sessionAttached).toBe(false);
    expect(fetch).toHaveBeenCalledWith(
      'https://testnet.onsocial.id/auth/app-session',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ code: 'abc', appId: 'tracker' }),
      })
    );

    const meFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          accountId: 'bob.testnet',
          tier: 'free',
          rateLimit: 60,
          appId: 'tracker',
        }),
    });
    const authed = new HttpClient({
      fetch: meFetch,
      gatewayUrl: 'https://testnet.onsocial.id',
    });
    authed.setToken(session.token);
    await new AuthModule(authed).me();
    expect(meFetch.mock.calls[0][1].headers.Authorization).toBe(
      'Bearer app.jwt.token'
    );
  });

  it('reads handoff params from a URL when code is omitted', async () => {
    const fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          token: 'app.jwt.token',
          accountId: 'bob.testnet',
          appId: 'tracker',
          expiresIn: '1h',
          tier: 'free',
          rateLimit: 60,
        }),
    });
    const auth = new AuthModule(
      new HttpClient({ fetch, gatewayUrl: 'https://testnet.onsocial.id' })
    );
    await auth.completeAppHandoff({
      url: 'https://track.example.com/app?onsocial_code=xyz&onsocial_app=tracker',
    });
    expect(JSON.parse(fetch.mock.calls[0][1].body as string)).toEqual({
      code: 'xyz',
      appId: 'tracker',
    });
  });

  it('throws when the URL has no handoff params', async () => {
    const auth = new AuthModule(new HttpClient({ fetch: vi.fn() }));
    await expect(
      auth.completeAppHandoff({ url: 'https://track.example.com/app' })
    ).rejects.toThrow(/onsocial_code/);
  });

  it('strips handoff params from the current URL after exchange', async () => {
    const fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          token: 'app.jwt.token',
          accountId: 'bob.testnet',
          appId: 'tracker',
          expiresIn: '1h',
          tier: 'free',
          rateLimit: 60,
        }),
    });
    const replaceState = vi.fn();
    vi.stubGlobal('window', {
      location: {
        href: 'https://track.example.com/app?onsocial_code=abc&onsocial_app=tracker&ref=1',
      },
      history: { state: null, replaceState },
    });
    try {
      const auth = new AuthModule(
        new HttpClient({ fetch, gatewayUrl: 'https://testnet.onsocial.id' })
      );
      await auth.completeAppHandoff();
      expect(replaceState).toHaveBeenCalledWith(null, '', '/app?ref=1');
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
