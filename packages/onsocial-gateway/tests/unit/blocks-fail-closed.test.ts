import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/config/index.js', () => ({
  config: {
    hasuraUrl: 'http://hasura.test/v1/graphql',
    hasuraAdminSecret: 'test-secret',
  },
}));

vi.mock('../../src/logger.js', () => ({
  logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn() },
}));

describe('checkBlockEitherWay', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it('returns blocked when either-way edge exists', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          data: {
            outgoing: [{ accountId: 'alice.testnet' }],
            incoming: [],
          },
        }),
      }))
    );
    const { checkBlockEitherWay } = await import(
      '../../src/services/blocks/index.js'
    );
    await expect(
      checkBlockEitherWay('alice.testnet', 'bob.testnet')
    ).resolves.toEqual({ ok: true, blocked: true });
  });

  it('fails closed when Hasura HTTP errors', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: false,
        status: 503,
        json: async () => ({}),
      }))
    );
    const { checkBlockEitherWay } = await import(
      '../../src/services/blocks/index.js'
    );
    await expect(
      checkBlockEitherWay('alice.testnet', 'bob.testnet')
    ).resolves.toEqual({ ok: false, unavailable: true });
  });

  it('fails closed when Hasura GraphQL returns errors', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          errors: [{ message: 'boom' }],
        }),
      }))
    );
    const { checkBlockEitherWay } = await import(
      '../../src/services/blocks/index.js'
    );
    await expect(
      checkBlockEitherWay('alice.testnet', 'bob.testnet')
    ).resolves.toEqual({ ok: false, unavailable: true });
  });

  it('fails closed when fetch throws', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('network down');
      })
    );
    const { checkBlockEitherWay } = await import(
      '../../src/services/blocks/index.js'
    );
    await expect(
      checkBlockEitherWay('alice.testnet', 'bob.testnet')
    ).resolves.toEqual({ ok: false, unavailable: true });
  });
});
