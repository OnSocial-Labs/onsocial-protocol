import { describe, expect, it, vi } from 'vitest';
import { PermissionsModule } from './permissions.js';
import { __resetLatestBlockCache } from '../internal/session-bridge.js';
import { NeedsWalletConfirmationError } from '../advanced/session.js';

interface HarnessOpts {
  network?: 'mainnet' | 'testnet';
  /** When true, expose a wallet broadcast getter (for admin-action tests). */
  walletBroadcast?: boolean;
}

function makeHarness(opts: HarnessOpts = {}) {
  __resetLatestBlockCache();
  const network = opts.network ?? 'mainnet';
  const signed: Array<{
    action: Record<string, unknown>;
    targetContract: string;
  }> = [];

  const get = vi.fn(async (path: string): Promise<unknown> => {
    if (path === '/relay/latest-block') return { block_height: 100 };
    throw new Error(`unexpected GET ${path}`);
  });
  const post = vi.fn(async (path: string) => {
    if (path === '/relay/delegate?wait=true') return { txHash: 'tx_signed' };
    throw new Error(`unexpected POST ${path}`);
  });

  const session = {
    signComposeDelegate: vi.fn(
      async (args: {
        action: Record<string, unknown>;
        targetContract: string;
      }) => {
        signed.push({
          action: args.action,
          targetContract: args.targetContract,
        });
        return { base64: 'BASE64_DELEGATE_BLOB', nonce: 1 };
      }
    ),
  };

  const walletSigner = vi.fn(
    async (_req: {
      receiverId: string;
      actions: Array<{
        type: 'FunctionCall';
        methodName: string;
        args: Record<string, unknown>;
        gas: string;
        deposit: string;
      }>;
    }) => ({ txHash: 'tx_wallet' })
  );

  const http = { post, get, network } as never;
  const getBroadcast = opts.walletBroadcast
    ? () =>
        ({
          kind: 'wallet' as const,
          signer: walletSigner,
        }) as never
    : undefined;
  const permissions = new PermissionsModule(
    http,
    () => session as never,
    getBroadcast
  );
  return { permissions, post, get, signed, walletSigner };
}

const CORE_MAINNET = 'core.onsocial.near';

describe('PermissionsModule transport (signed actions)', () => {
  it('routes set_permission through wallet (execute_admin) when broadcast=wallet', async () => {
    const { permissions, walletSigner } = makeHarness({
      walletBroadcast: true,
    });

    await permissions.grant('bob.near', 'profile/', 1, 123);

    expect(walletSigner).toHaveBeenCalledTimes(1);
    const call = walletSigner.mock.calls[0][0];
    expect(call.receiverId).toBe(CORE_MAINNET);
    expect(call.actions).toHaveLength(1);
    expect(call.actions[0]).toMatchObject({
      type: 'FunctionCall',
      methodName: 'execute_admin',
    });
    expect(call.actions[0].args).toEqual({
      request: {
        action: {
          type: 'set_permission',
          grantee: 'bob.near',
          path: 'profile/',
          level: 1,
          expires_at: 123,
        },
      },
    });
  });

  it('routes set_key_permission through wallet (execute_admin) when broadcast=wallet', async () => {
    const { permissions, walletSigner } = makeHarness({
      walletBroadcast: true,
    });

    await permissions.grantKey('ed25519:abc', 'settings/', 2);

    expect(walletSigner).toHaveBeenCalledTimes(1);
    const call = walletSigner.mock.calls[0][0];
    expect(call.actions[0].methodName).toBe('execute_admin');
    expect(call.actions[0].args).toEqual({
      request: {
        action: {
          type: 'set_key_permission',
          public_key: 'ed25519:abc',
          path: 'settings/',
          level: 2,
        },
      },
    });
  });

  it('throws NeedsWalletConfirmationError when admin actions are attempted without a wallet broadcast', async () => {
    const { permissions } = makeHarness();
    await expect(
      permissions.grant('bob.near', 'profile/', 1)
    ).rejects.toBeInstanceOf(NeedsWalletConfirmationError);
    await expect(
      permissions.grantKey('ed25519:abc', 'settings/', 2)
    ).rejects.toBeInstanceOf(NeedsWalletConfirmationError);
  });

  it('encodes read query parameters for account permission checks', async () => {
    const { permissions, get } = makeHarness();
    get.mockResolvedValue(true);

    const allowed = await permissions.has(
      'alice.near',
      'bob+mod.near',
      'groups/devs/content/',
      1
    );

    expect(allowed).toBe(true);
    expect(get).toHaveBeenCalledWith(
      '/data/has-permission?owner=alice.near&grantee=bob%2Bmod.near&path=groups%2Fdevs%2Fcontent%2F&level=1'
    );
  });

  it('revoke is grant with level=0 (wallet-routed)', async () => {
    const { permissions, walletSigner } = makeHarness({
      walletBroadcast: true,
    });

    await permissions.revoke('bob.near', 'profile/');

    expect(walletSigner.mock.calls[0][0].actions[0].args).toEqual({
      request: {
        action: {
          type: 'set_permission',
          grantee: 'bob.near',
          path: 'profile/',
          level: 0,
        },
      },
    });
  });

  it('revokeKey is grantKey with level=0 (wallet-routed)', async () => {
    const { permissions, walletSigner } = makeHarness({
      walletBroadcast: true,
    });

    await permissions.revokeKey('ed25519:abc', 'settings/');

    expect(walletSigner.mock.calls[0][0].actions[0].args).toEqual({
      request: {
        action: {
          type: 'set_key_permission',
          public_key: 'ed25519:abc',
          path: 'settings/',
          level: 0,
        },
      },
    });
  });

  describe('grantOrPropose', () => {
    it('falls through to grant() for non-group paths (wallet-routed)', async () => {
      const { permissions, walletSigner, get } = makeHarness({
        walletBroadcast: true,
      });

      await permissions.grantOrPropose('bob.near', 'profile/', 1);

      // Only the latest-block GET should fire (no group-config lookup)
      expect(
        get.mock.calls.filter(
          ([p]) => typeof p === 'string' && p.includes('group-config')
        )
      ).toHaveLength(0);
      expect(walletSigner.mock.calls[0][0].actions[0].methodName).toBe(
        'execute_admin'
      );
    });

    it('uses direct grant on a non-member-driven group path (wallet-routed)', async () => {
      const { permissions, walletSigner, get } = makeHarness({
        walletBroadcast: true,
      });
      get.mockImplementation(async (path: string) => {
        if (path === '/relay/latest-block') return { block_height: 100 };
        if (typeof path === 'string' && path.includes('group-config'))
          return { member_driven: false };
        throw new Error(`unexpected GET ${path}`);
      });

      await permissions.grantOrPropose('bob.near', 'groups/dao/content/', 1);

      expect(get).toHaveBeenCalledWith(expect.stringContaining('group-config'));
      expect(walletSigner.mock.calls[0][0].actions[0].methodName).toBe(
        'execute_admin'
      );
    });

    it('files a path_permission_grant proposal in member-driven groups', async () => {
      const { permissions, signed, get } = makeHarness();
      get.mockImplementation(async (path: string) => {
        if (path === '/relay/latest-block') return { block_height: 100 };
        if (typeof path === 'string' && path.includes('group-config'))
          return { member_driven: true };
        throw new Error(`unexpected GET ${path}`);
      });

      await permissions.grantOrPropose('bob.near', 'groups/dao/content/', 2, {
        reason: 'promote',
      });

      expect(signed[0]).toEqual({
        action: {
          type: 'create_proposal',
          group_id: 'dao',
          proposal_type: 'path_permission_grant',
          changes: {
            target_user: 'bob.near',
            path: 'groups/dao/content/',
            level: 2,
            reason: 'promote',
          },
        },
        targetContract: CORE_MAINNET,
      });
    });

    it('files a path_permission_revoke proposal when level=0 in member-driven groups', async () => {
      const { permissions, signed, get } = makeHarness();
      get.mockImplementation(async (path: string) => {
        if (path === '/relay/latest-block') return { block_height: 100 };
        if (typeof path === 'string' && path.includes('group-config'))
          return { member_driven: true };
        throw new Error(`unexpected GET ${path}`);
      });

      await permissions.revokeOrPropose('bob.near', 'groups/dao/content/', {
        reason: 'demote',
      });

      expect(signed[0]).toEqual({
        action: {
          type: 'create_proposal',
          group_id: 'dao',
          proposal_type: 'path_permission_revoke',
          changes: {
            target_user: 'bob.near',
            path: 'groups/dao/content/',
            reason: 'demote',
          },
        },
        targetContract: CORE_MAINNET,
      });
    });
  });
});
