import { describe, expect, it, vi } from 'vitest';
import { MutesModule } from './mutes.js';
import type { HttpClient } from '../internal/http.js';

function makeHttp(responses: {
  get?: Record<string, unknown>;
  post?: Record<string, unknown>;
  del?: Record<string, unknown>;
}) {
  const get = vi.fn(async (path: string) => {
    return responses.get?.[path] ?? {};
  });
  const post = vi.fn(async (path: string, ..._rest: unknown[]) => {
    void _rest;
    return responses.post?.[path] ?? {};
  });
  const del = vi.fn(async (path: string) => {
    return responses.del?.[path] ?? { status: 'ok' };
  });
  return {
    spies: { get, post, del },
    http: { get, post, delete: del } as unknown as HttpClient,
  };
}

describe('MutesModule', () => {
  it('list hits GET /developer/mutes', async () => {
    const { http, spies } = makeHttp({
      get: {
        '/developer/mutes': {
          mutes: [
            {
              mutedAccountId: 'bob.near',
              createdAt: '2026-01-01T00:00:00.000Z',
            },
          ],
        },
      },
    });
    const m = new MutesModule(http);
    const result = await m.list();
    expect(spies.get).toHaveBeenCalledWith('/developer/mutes');
    expect(result.mutes).toHaveLength(1);
    expect(result.mutes[0]?.mutedAccountId).toBe('bob.near');
  });

  it('add posts mutedAccountId and returns mute row', async () => {
    const { http, spies } = makeHttp({
      post: {
        '/developer/mutes': {
          mute: {
            mutedAccountId: 'bob.near',
            createdAt: '2026-01-01T00:00:00.000Z',
          },
        },
      },
    });
    const m = new MutesModule(http);
    const mute = await m.add('bob.near');
    expect(spies.post).toHaveBeenCalledWith('/developer/mutes', {
      mutedAccountId: 'bob.near',
    });
    expect(mute.mutedAccountId).toBe('bob.near');
  });

  it('remove deletes encoded account path', async () => {
    const { http, spies } = makeHttp({
      del: { '/developer/mutes/bob.near': { status: 'ok' } },
    });
    const m = new MutesModule(http);
    await m.remove('bob.near');
    expect(spies.del).toHaveBeenCalledWith('/developer/mutes/bob.near');
  });

  it('has returns true when muted list includes target', async () => {
    const { http } = makeHttp({
      get: {
        '/developer/mutes': {
          mutes: [
            {
              mutedAccountId: 'Bob.near',
              createdAt: '2026-01-01T00:00:00.000Z',
            },
          ],
        },
      },
    });
    const m = new MutesModule(http);
    expect(await m.has('bob.near')).toBe(true);
    expect(await m.has('carol.near')).toBe(false);
  });
});
