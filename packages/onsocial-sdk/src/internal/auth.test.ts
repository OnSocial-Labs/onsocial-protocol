import { describe, expect, it, vi } from 'vitest';
import { HttpClient } from './http.js';
import { AuthModule } from './auth.js';
import { writeAppHandoffSession } from '../auth-handoff-session.js';

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
    ).rejects.toThrow(/Missing appId/);
    await expect(
      auth.completeAppHandoff({
        url: 'https://track.example.com/app',
        appId: 'tracker',
      })
    ).rejects.toThrow(/No community session for "tracker"/);
  });

  it('restores a stored app refresh when the URL has no code', async () => {
    const memory = new Map<string, string>();
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: {
        getItem: (key: string) => memory.get(key) ?? null,
        setItem: (key: string, value: string) => {
          memory.set(key, value);
        },
        removeItem: (key: string) => {
          memory.delete(key);
        },
      },
    });
    writeAppHandoffSession({
      appId: 'tracker',
      accountId: 'bob.testnet',
      refreshToken: 'old.refresh',
    });
    const fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          token: 'new.access',
          refreshToken: 'new.refresh',
          accountId: 'bob.testnet',
          appId: 'tracker',
          expiresIn: '15m',
          tier: 'free',
          rateLimit: 60,
        }),
    });
    try {
      const auth = new AuthModule(
        new HttpClient({ fetch, gatewayUrl: 'https://testnet.onsocial.id' })
      );
      const session = await auth.completeAppHandoff({
        url: 'https://track.example.com/app',
        appId: 'tracker',
      });
      expect(session.token).toBe('new.access');
      expect(JSON.parse(fetch.mock.calls[0][1].body as string)).toEqual({
        refreshToken: 'old.refresh',
        appId: 'tracker',
      });
    } finally {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      delete (globalThis as any).localStorage;
    }
  });

  it('retries a graph 401 after rotating the app refresh token', async () => {
    const memory = new Map<string, string>();
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: {
        getItem: (key: string) => memory.get(key) ?? null,
        setItem: (key: string, value: string) => {
          memory.set(key, value);
        },
        removeItem: (key: string) => {
          memory.delete(key);
        },
      },
    });
    writeAppHandoffSession({
      appId: 'tracker',
      accountId: 'bob.testnet',
      refreshToken: 'old.refresh',
    });
    const fetch = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            token: 'first.access',
            refreshToken: 'first.refresh',
            accountId: 'bob.testnet',
            appId: 'tracker',
            expiresIn: '15m',
            tier: 'free',
            rateLimit: 60,
          }),
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: () => Promise.resolve({ error: 'expired' }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            token: 'second.access',
            refreshToken: 'second.refresh',
            accountId: 'bob.testnet',
            appId: 'tracker',
            expiresIn: '15m',
            tier: 'free',
            rateLimit: 60,
          }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ accountId: 'bob.testnet' }),
      });
    try {
      const http = new HttpClient({
        fetch,
        gatewayUrl: 'https://testnet.onsocial.id',
      });
      const auth = new AuthModule(http);
      http.setUnauthorizedHandler(() => auth.refreshAppAccess());
      await auth.completeAppHandoff({
        url: 'https://track.example.com/app',
        appId: 'tracker',
      });
      await http.get('/graph/query');
      expect(fetch.mock.calls.map((call) => String(call[0]))).toEqual([
        'https://testnet.onsocial.id/auth/app-refresh',
        'https://testnet.onsocial.id/graph/query',
        'https://testnet.onsocial.id/auth/app-refresh',
        'https://testnet.onsocial.id/graph/query',
      ]);
      expect(fetch.mock.calls[3][1].headers.Authorization).toBe(
        'Bearer second.access'
      );
    } finally {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      delete (globalThis as any).localStorage;
    }
  });

  it('throws AppHandoffRedirect instead of hanging on first visit', async () => {
    const memory = new Map<string, string>();
    const assign = vi.fn();
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: {
        getItem: (key: string) => memory.get(key) ?? null,
        setItem: (key: string, value: string) => {
          memory.set(key, value);
        },
        removeItem: (key: string) => {
          memory.delete(key);
        },
      },
    });
    vi.stubGlobal('window', {
      location: {
        href: 'https://track.example.com/app',
        assign,
      },
    });
    try {
      const auth = new AuthModule(new HttpClient({ fetch: vi.fn() }));
      await expect(
        auth.completeAppHandoff({
          url: 'https://track.example.com/app',
          appId: 'tracker',
          osOrigin: 'https://onsocial.id',
        })
      ).rejects.toMatchObject({
        name: 'AppHandoffRedirect',
        redirected: true,
      });
      expect(String(assign.mock.calls[0]?.[0])).toContain(
        'https://onsocial.id/handoff?app=tracker&pk='
      );
    } finally {
      vi.unstubAllGlobals();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      delete (globalThis as any).localStorage;
    }
  });

  it('refresh() rotates the app token after handoff, not the viewer cookie', async () => {
    const memory = new Map<string, string>();
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: {
        getItem: (key: string) => memory.get(key) ?? null,
        setItem: (key: string, value: string) => {
          memory.set(key, value);
        },
        removeItem: (key: string) => {
          memory.delete(key);
        },
      },
    });
    writeAppHandoffSession({
      appId: 'tracker',
      accountId: 'bob.testnet',
      refreshToken: 'old.refresh',
    });
    const fetch = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            token: 'first.access',
            refreshToken: 'first.refresh',
            accountId: 'bob.testnet',
            appId: 'tracker',
            expiresIn: '15m',
            tier: 'free',
            rateLimit: 60,
          }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            token: 'second.access',
            refreshToken: 'second.refresh',
            accountId: 'bob.testnet',
            appId: 'tracker',
            expiresIn: '15m',
            tier: 'free',
            rateLimit: 60,
          }),
      });
    try {
      const auth = new AuthModule(
        new HttpClient({ fetch, gatewayUrl: 'https://testnet.onsocial.id' })
      );
      await auth.completeAppHandoff({
        url: 'https://track.example.com/app',
        appId: 'tracker',
      });
      const refreshed = await auth.refresh();
      expect(refreshed.token).toBe('second.access');
      expect(fetch.mock.calls.map((call) => String(call[0]))).toEqual([
        'https://testnet.onsocial.id/auth/app-refresh',
        'https://testnet.onsocial.id/auth/app-refresh',
      ]);
    } finally {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      delete (globalThis as any).localStorage;
    }
  });

  it('refresh() still uses the viewer cookie route without an app session', async () => {
    const fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          token: 'viewer.access',
          expiresIn: '15m',
          tier: 'free',
          rateLimit: 60,
        }),
    });
    const auth = new AuthModule(
      new HttpClient({ fetch, gatewayUrl: 'https://testnet.onsocial.id' })
    );
    await auth.refresh();
    expect(String(fetch.mock.calls[0][0])).toBe(
      'https://testnet.onsocial.id/auth/refresh'
    );
  });

  it('logout clears the app refresh and can forget the keypair', async () => {
    const memory = new Map<string, string>();
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: {
        getItem: (key: string) => memory.get(key) ?? null,
        setItem: (key: string, value: string) => {
          memory.set(key, value);
        },
        removeItem: (key: string) => {
          memory.delete(key);
        },
      },
    });
    writeAppHandoffSession({
      appId: 'tracker',
      accountId: 'bob.testnet',
      refreshToken: 'old.refresh',
    });
    const { clearAppHandoffKey, writeAppHandoffKey, readAppHandoffKey } =
      await import('../auth-handoff-key.js');
    const { readAppHandoffSession } = await import('../auth-handoff-session.js');
    const pendingKey = {
      appId: 'tracker',
      publicKey: 'ed25519:keep',
      secretSeedB64u: 'seed',
      osOrigin: 'https://onsocial.id',
    };
    const fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          token: 'first.access',
          refreshToken: 'first.refresh',
          accountId: 'bob.testnet',
          appId: 'tracker',
          expiresIn: '15m',
          tier: 'free',
          rateLimit: 60,
        }),
    });
    try {
      const auth = new AuthModule(
        new HttpClient({ fetch, gatewayUrl: 'https://testnet.onsocial.id' })
      );
      await auth.completeAppHandoff({
        url: 'https://track.example.com/app',
        appId: 'tracker',
      });
      writeAppHandoffKey(pendingKey);
      auth.logout();
      expect(readAppHandoffSession('tracker')).toBeNull();
      expect(readAppHandoffKey('tracker')?.publicKey).toBe('ed25519:keep');

      writeAppHandoffSession({
        appId: 'tracker',
        accountId: 'bob.testnet',
        refreshToken: 'old.refresh',
      });
      clearAppHandoffKey('tracker');
      await auth.completeAppHandoff({
        url: 'https://track.example.com/app',
        appId: 'tracker',
      });
      writeAppHandoffKey(pendingKey);
      auth.logout({ forgetKey: true });
      expect(readAppHandoffKey('tracker')).toBeNull();
    } finally {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      delete (globalThis as any).localStorage;
    }
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
