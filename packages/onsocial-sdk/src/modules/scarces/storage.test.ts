import { describe, expect, it, vi } from 'vitest';
import { NeedsWalletConfirmationError } from '../../advanced/session.js';
import { ScarcesStorageApi } from './storage.js';

function makeApi(
  opts: {
    balanceYocto?: string | { total?: string };
    balanceShape?: 'string' | 'object';
    wallet?: boolean;
  } = {}
) {
  const get = vi.fn(async (path: string) => {
    if (path.startsWith('/data/scarces-storage-balance')) {
      if (opts.balanceShape === 'object') {
        return {
          total: (opts.balanceYocto as { total?: string })?.total ?? '0',
        };
      }
      return (opts.balanceYocto as string) ?? '0';
    }
    if (path === '/relay/latest-block') return { block_height: 100 };
    throw new Error(`unexpected GET ${path}`);
  });
  const post = vi.fn(async (path: string) => {
    if (path.startsWith('/compose/prepare/')) {
      return {
        action: { type: 'storage_deposit', metadata: {} },
        target_account: 'scarces.onsocial.near',
      };
    }
    return { txHash: 'deposited' };
  });
  const http = { get, post, network: 'mainnet' } as never;
  const session = {
    accountId: 'alice.near',
    signComposeDelegate: vi.fn(async () => ({
      base64: 'BASE64',
      nonce: 1,
    })),
  };
  const signer = vi.fn(async () => ({ txHash: 'wallet-deposit' }));
  const getBroadcast = opts.wallet
    ? () => ({ kind: 'wallet' as const, signer })
    : undefined;
  const api = new ScarcesStorageApi(
    http,
    () => session as never,
    getBroadcast as never
  );
  return { api, get, post, signer };
}

describe('ScarcesStorageApi.balanceOf', () => {
  it('returns yoctoNEAR when gateway responds with a raw string', async () => {
    const { api, get } = makeApi({ balanceYocto: '12345' });
    const out = await api.balanceOf('alice.near');
    expect(out).toBe('12345');
    expect(get).toHaveBeenCalledWith(
      expect.stringContaining(
        '/data/scarces-storage-balance?accountId=alice.near'
      )
    );
  });

  it('returns total when gateway responds with an object', async () => {
    const { api } = makeApi({
      balanceShape: 'object',
      balanceYocto: { total: '99' } as never,
    });
    expect(await api.balanceOf('alice.near')).toBe('99');
  });

  it("returns '0' when gateway responds with object missing total", async () => {
    const { api } = makeApi({
      balanceShape: 'object',
      balanceYocto: {} as never,
    });
    expect(await api.balanceOf('alice.near')).toBe('0');
  });
});

describe('ScarcesStorageApi.ensure', () => {
  const ONE_NEAR = (10n ** 24n).toString();
  const HALF_NEAR = (10n ** 24n / 2n).toString();

  it('returns null when balance already meets minNear', async () => {
    const { api, post } = makeApi({ balanceYocto: ONE_NEAR });
    const r = await api.ensure({ minNear: '1' });
    expect(r).toBeNull();
    // No deposit should have been issued.
    expect(post).not.toHaveBeenCalledWith(
      expect.stringContaining('/relay/'),
      expect.anything(),
      expect.anything()
    );
  });

  it('requires wallet broadcast when balance top-up needs an attached deposit', async () => {
    const { api, post } = makeApi({ balanceYocto: HALF_NEAR });
    await expect(api.ensure({ minNear: '1' })).rejects.toMatchObject({
      reason: 'value_deposit_required',
    });
    await expect(api.ensure({ minNear: '1' })).rejects.toBeInstanceOf(
      NeedsWalletConfirmationError
    );
    const prepCall = post.mock.calls.find(([p]) =>
      String(p).includes('/compose/prepare/')
    );
    expect(prepCall).toBeDefined();
  });

  it('deposits the delta via wallet broadcast when balance is below minNear', async () => {
    const { api, post, signer } = makeApi({
      balanceYocto: HALF_NEAR,
      wallet: true,
    });
    const r = await api.ensure({ minNear: '1' });
    expect(r).not.toBeNull();
    // /compose/prepare/* should have been called with a deposit amount.
    const prepCall = post.mock.calls.find(([p]) =>
      String(p).includes('/compose/prepare/')
    );
    expect(prepCall).toBeDefined();
    const body = (prepCall as unknown as [string, { amountNear?: string }])[1];
    // Delta is 0.5 NEAR.
    expect(body.amountNear).toBe('0.5');
    expect(signer).toHaveBeenCalledWith({
      receiverId: 'scarces.onsocial.near',
      actions: [
        expect.objectContaining({
          methodName: 'execute',
          deposit: HALF_NEAR,
        }),
      ],
    });
  });

  it('deposits full amount when current balance is zero', async () => {
    const { api, post } = makeApi({ balanceYocto: '0', wallet: true });
    await api.ensure({ minNear: '0.05' });
    const prepCall = post.mock.calls.find(([p]) =>
      String(p).includes('/compose/prepare/')
    );
    const body = (prepCall as unknown as [string, { amountNear?: string }])[1];
    expect(body.amountNear).toBe('0.05');
  });

  it('honors explicit accountId parameter over session', async () => {
    const { api, get } = makeApi({ balanceYocto: ONE_NEAR });
    await api.ensure({ minNear: '0.5', accountId: 'bob.near' });
    expect(get).toHaveBeenCalledWith(
      expect.stringContaining('accountId=bob.near')
    );
  });

  it('throws when no accountId and no session attached', async () => {
    const get = vi.fn(async () => '0');
    const post = vi.fn();
    const http = { get, post, network: 'mainnet' } as never;
    const api = new ScarcesStorageApi(http, () => undefined as never);
    await expect(api.ensure({ minNear: '1' })).rejects.toThrow(/no accountId/);
  });
});
