import { describe, expect, it, vi } from 'vitest';

const mockListCommunityAppCatalog = vi.fn();

vi.mock('../../src/services/developer-apps/index.js', () => ({
  listCommunityAppCatalog: (...args: unknown[]) =>
    mockListCommunityAppCatalog(...args),
}));

vi.mock('../../src/config/index.js', () => ({
  config: {
    corsOrigins: 'https://os.example,https://portal.example',
  },
}));

import { createCorsOriginResolver } from '../../src/middleware/cors-origin.js';

function allow(
  origin: string | undefined
): Promise<{ err: Error | null; allow?: boolean }> {
  const resolver = createCorsOriginResolver();
  return new Promise((resolve) => {
    resolver(origin, (err, allowed) => {
      resolve({ err, allow: allowed });
    });
  });
}

describe('createCorsOriginResolver', () => {
  it('allows configured OS origins and listed community origins', async () => {
    mockListCommunityAppCatalog.mockResolvedValue([
      { href: 'https://track.example.com/app' },
    ]);

    expect(await allow(undefined)).toEqual({ err: null, allow: true });
    expect(await allow('https://os.example')).toEqual({
      err: null,
      allow: true,
    });
    expect(await allow('https://track.example.com')).toEqual({
      err: null,
      allow: true,
    });
    expect(await allow('https://evil.example')).toEqual({
      err: null,
      allow: false,
    });
  });
});
