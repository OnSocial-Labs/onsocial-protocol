import { describe, expect, it, vi } from 'vitest';
import {
  communityAppIdFromLauncherId,
  launchCommunityApp,
  resolveCommunityLaunchHref,
} from '@/lib/community-app-handoff';

describe('community app handoff', () => {
  it('reads the listed app id from a launcher tile id', () => {
    expect(communityAppIdFromLauncherId('community:tracker')).toBe('tracker');
    expect(communityAppIdFromLauncherId('boost')).toBeNull();
  });

  it('appends handoff params only when a code was issued', () => {
    expect(
      resolveCommunityLaunchHref({
        href: 'https://track.example.com/app',
        appId: 'tracker',
        handoff: null,
      })
    ).toBe('https://track.example.com/app');
    expect(
      resolveCommunityLaunchHref({
        href: 'https://track.example.com/app',
        appId: 'tracker',
        handoff: { code: 'abc', href: 'https://track.example.com/app' },
      })
    ).toBe(
      'https://track.example.com/app?onsocial_code=abc&onsocial_app=tracker'
    );
  });

  it('opens the listing href when no viewer JWT is cached', async () => {
    const replace = vi.fn();
    const href = await launchCommunityApp({
      appId: 'tracker',
      href: 'https://track.example.com/app',
      token: null,
      popup: { closed: false, location: { replace } } as unknown as Window,
    });
    expect(href).toBe('https://track.example.com/app');
    expect(replace).toHaveBeenCalledWith('https://track.example.com/app');
  });

  it('handoffs when the proxy returns a code', async () => {
    const original = globalThis.fetch;
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        code: 'abc',
        href: 'https://track.example.com/app',
      }),
    }) as typeof fetch;
    const replace = vi.fn();
    try {
      const href = await launchCommunityApp({
        appId: 'tracker',
        href: 'https://track.example.com/app',
        token: 'viewer.jwt',
        popup: { closed: false, location: { replace } } as unknown as Window,
      });
      expect(href).toContain('onsocial_code=abc');
      expect(replace).toHaveBeenCalledWith(href);
      expect(globalThis.fetch).toHaveBeenCalledWith(
        '/api/onapi/auth/app-handoff',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            Authorization: 'Bearer viewer.jwt',
          }),
        })
      );
    } finally {
      globalThis.fetch = original;
    }
  });

  it('falls back to the raw listing when handoff fails', async () => {
    const original = globalThis.fetch;
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({ error: 'nope' }),
    }) as typeof fetch;
    const replace = vi.fn();
    try {
      const href = await launchCommunityApp({
        appId: 'tracker',
        href: 'https://track.example.com/app',
        token: 'viewer.jwt',
        popup: { closed: false, location: { replace } } as unknown as Window,
      });
      expect(href).toBe('https://track.example.com/app');
      expect(replace).toHaveBeenCalledWith('https://track.example.com/app');
    } finally {
      globalThis.fetch = original;
    }
  });
});
