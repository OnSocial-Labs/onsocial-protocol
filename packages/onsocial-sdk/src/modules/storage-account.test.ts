import { describe, expect, it, beforeEach, vi } from 'vitest';
import {
  StorageAccountModule,
  type TransactionSigner,
} from './storage-account.js';
import { NEAR } from '../near-amount.js';
import { SignerRequiredError } from '../errors.js';
import { __resetLatestBlockCache } from '../internal/session-bridge.js';

beforeEach(() => {
  __resetLatestBlockCache();
});

function makeMod(overrides: {
  post?: ReturnType<typeof vi.fn>;
  get?: ReturnType<typeof vi.fn>;
  actorId?: string | null;
  signer?: TransactionSigner;
  /** When provided, the spy receives every signComposeDelegate(...) call. */
  signed?: Array<{
    action: Record<string, unknown>;
    targetContract: string;
  }>;
  /** Pass null to simulate no attached session (forces SessionRequiredError). */
  noSession?: boolean;
}) {
  const get =
    overrides.get ??
    vi.fn(async (path: string) => {
      if (path === '/relay/latest-block') return { block_height: 100 };
      return null;
    });
  const post =
    overrides.post ??
    vi.fn(async (path: string) => {
      if (path === '/relay/delegate?wait=true') return { txHash: 'tx_signed' };
      return { txHash: 'tx' };
    });
  const http = {
    post,
    get,
    network: 'mainnet',
    actorId: overrides.actorId ?? null,
  };

  const session = overrides.noSession
    ? null
    : ({
        signComposeDelegate: vi.fn(
          async (args: {
            action: Record<string, unknown>;
            targetContract: string;
          }) => {
            overrides.signed?.push({
              action: args.action,
              targetContract: args.targetContract,
            });
            return { base64: 'BASE64_DELEGATE_BLOB', nonce: 1 };
          }
        ),
      } as never);

  return new StorageAccountModule(
    http as never,
    () => session,
    overrides.signer
  );
}

describe('StorageAccountModule reads', () => {
  it('balance(accountId) hits /data/storage-balance with the right query', async () => {
    const get = vi.fn().mockResolvedValue({ balance: '0' });
    const mod = makeMod({ get });
    await mod.balance('alice.near');
    expect(get).toHaveBeenCalledWith(
      '/data/storage-balance?accountId=alice.near'
    );
  });

  it('balance() falls back to actorId from http client', async () => {
    const get = vi.fn().mockResolvedValue({ balance: '0' });
    const mod = makeMod({ get, actorId: 'me.near' });
    await mod.balance();
    expect(get).toHaveBeenCalledWith('/data/storage-balance?accountId=me.near');
  });

  it('balance() throws when no actor configured and no accountId given', async () => {
    const mod = makeMod({});
    await expect(mod.balance()).rejects.toThrow(/no actor configured/);
  });

  it('groupPool, sharedPool, platformPool, platformAllowance call expected paths', async () => {
    const get = vi.fn().mockResolvedValue({});
    const mod = makeMod({ get });
    await mod.groupPool('cool-cats');
    await mod.sharedPool('alice.near');
    await mod.platformPool();
    await mod.platformAllowance('alice.near');
    expect(get.mock.calls.map((c) => c[0])).toEqual([
      '/data/group-pool?groupId=cool-cats',
      '/data/shared-pool?poolId=alice.near',
      '/data/platform-pool',
      '/data/platform-allowance?accountId=alice.near',
    ]);
  });

  it('sponsorshipReceived returns shared_storage from balance', async () => {
    const get = vi.fn().mockResolvedValue({
      balance: '0',
      shared_storage: { max_bytes: 4096, used_bytes: 100, pool_id: 'sp.near' },
    });
    const mod = makeMod({ get });
    const got = await mod.sponsorshipReceived('alice.near');
    expect(got).toEqual({
      max_bytes: 4096,
      used_bytes: 100,
      pool_id: 'sp.near',
    });
  });
});

describe('StorageAccountModule gasless writes', () => {
  const CORE = 'core.onsocial.near';

  it('withdraw() with no amount sends empty value object', async () => {
    const signed: Array<{
      action: Record<string, unknown>;
      targetContract: string;
    }> = [];
    const mod = makeMod({ signed });
    await mod.withdraw();
    expect(signed).toEqual([
      {
        action: { type: 'set', data: { 'storage/withdraw': {} } },
        targetContract: CORE,
      },
    ]);
  });

  it('withdraw(amount) attaches yocto string', async () => {
    const signed: Array<{
      action: Record<string, unknown>;
      targetContract: string;
    }> = [];
    const mod = makeMod({ signed });
    await mod.withdraw(NEAR('0.5'));
    expect(signed[0]).toEqual({
      action: {
        type: 'set',
        data: { 'storage/withdraw': { amount: '500000000000000000000000' } },
      },
      targetContract: CORE,
    });
  });

  it('tip emits storage/tip with target_id and amount', async () => {
    const signed: Array<{
      action: Record<string, unknown>;
      targetContract: string;
    }> = [];
    const mod = makeMod({ signed });
    await mod.tip('bob.near', NEAR('0.001'));
    expect(signed[0]).toEqual({
      action: {
        type: 'set',
        data: {
          'storage/tip': {
            target_id: 'bob.near',
            amount: '1000000000000000000000',
          },
        },
      },
      targetContract: CORE,
    });
  });

  it('sponsor / unsponsor map to share_storage / return_shared_storage', async () => {
    const signed: Array<{
      action: Record<string, unknown>;
      targetContract: string;
    }> = [];
    const mod = makeMod({ signed });
    await mod.sponsor('bob.near', { maxBytes: 4096 });
    await mod.unsponsor();
    expect((signed[0].action as { data: unknown }).data).toEqual({
      'storage/share_storage': { target_id: 'bob.near', max_bytes: 4096 },
    });
    expect((signed[1].action as { data: unknown }).data).toEqual({
      'storage/return_shared_storage': {},
    });
  });

  it('setSponsorQuota and setSponsorDefault snake_case the args', async () => {
    const signed: Array<{
      action: Record<string, unknown>;
      targetContract: string;
    }> = [];
    const mod = makeMod({ signed });
    await mod.setSponsorQuota('cool-cats', 'bob.near', {
      enabled: true,
      dailyRefillBytes: 100,
      allowanceMaxBytes: 1000,
    });
    expect((signed[0].action as { data: unknown }).data).toEqual({
      'storage/group_sponsor_quota_set': {
        group_id: 'cool-cats',
        target_id: 'bob.near',
        enabled: true,
        daily_refill_bytes: 100,
        allowance_max_bytes: 1000,
      },
    });

    await mod.setSponsorDefault('cool-cats', {
      enabled: false,
      dailyRefillBytes: 0,
      allowanceMaxBytes: 0,
    });
    expect((signed[1].action as { data: unknown }).data).toEqual({
      'storage/group_sponsor_default_set': {
        group_id: 'cool-cats',
        enabled: false,
        daily_refill_bytes: 0,
        allowance_max_bytes: 0,
      },
    });
  });

  it('fires onSubmitted/onConfirmed observers', async () => {
    const onSubmitted = vi.fn();
    const onConfirmed = vi.fn();
    const post = vi.fn().mockResolvedValue({ txHash: 'tx-w' });
    const mod = makeMod({ post });
    await mod.withdraw(undefined, { onSubmitted, onConfirmed });
    expect(onSubmitted).toHaveBeenCalledWith({ txHash: 'tx-w' });
    expect(onConfirmed).toHaveBeenCalledWith({ txHash: 'tx-w' });
  });
});

describe('StorageAccountModule deposit-funded writes', () => {
  it('deposit without signer throws SignerRequiredError with payload', async () => {
    const mod = makeMod({});
    await expect(mod.deposit(NEAR('0.1'))).rejects.toMatchObject({
      name: 'SignerRequiredError',
      code: 'SIGNER_REQUIRED',
      payload: {
        receiverId: 'core.onsocial.near',
        methodName: 'execute',
        deposit: '100000000000000000000000',
        gas: '300000000000000',
        args: {
          request: {
            action: {
              type: 'set',
              data: {
                'storage/deposit': { amount: '100000000000000000000000' },
              },
            },
          },
        },
      },
    });
  });

  it('deposit with per-call signer signs and broadcasts', async () => {
    const signer: TransactionSigner = {
      signAndSendTransaction: vi.fn().mockResolvedValue({ txHash: 'tx-d' }),
    };
    const mod = makeMod({});
    const r = await mod.deposit(NEAR('0.1'), { signer });
    expect(r.txHash).toBe('tx-d');
    expect(signer.signAndSendTransaction).toHaveBeenCalledWith({
      receiverId: 'core.onsocial.near',
      methodName: 'execute',
      args: {
        request: {
          action: {
            type: 'set',
            data: {
              'storage/deposit': { amount: '100000000000000000000000' },
            },
          },
        },
      },
      deposit: '100000000000000000000000',
      gas: '300000000000000',
    });
  });

  it('default signer on the module is used when opts.signer omitted', async () => {
    const signer: TransactionSigner = {
      signAndSendTransaction: vi.fn().mockResolvedValue({ txHash: 'tx-d' }),
    };
    const mod = makeMod({ signer });
    await mod.fundGroupPool('cool-cats', NEAR('1'));
    expect(signer.signAndSendTransaction).toHaveBeenCalledWith(
      expect.objectContaining({
        deposit: '1000000000000000000000000',
        args: {
          request: {
            action: {
              type: 'set',
              data: {
                'storage/group_pool_deposit': {
                  group_id: 'cool-cats',
                  amount: '1000000000000000000000000',
                },
              },
            },
          },
        },
      })
    );
  });

  it('SignerRequiredError extends Error and exposes code', async () => {
    const mod = makeMod({});
    try {
      await mod.fundPlatform(NEAR('0.5'));
    } catch (e) {
      expect(e).toBeInstanceOf(SignerRequiredError);
      expect((e as SignerRequiredError).code).toBe('SIGNER_REQUIRED');
      expect((e as Error).message).toMatch(/storage\/platform_pool_deposit/);
    }
  });
});
