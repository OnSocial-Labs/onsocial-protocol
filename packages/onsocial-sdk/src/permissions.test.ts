import { describe, expect, it, vi } from 'vitest';
import { PermissionsModule } from './permissions.js';

describe('PermissionsModule transport', () => {
  it('posts set_permission to /relay/execute?wait=true targeting the core contract', async () => {
    const post = vi.fn().mockResolvedValue({ txHash: 'tx-grant' });
    const permissions = new PermissionsModule({
      post,
      network: 'mainnet',
    } as never);

    await permissions.grant('bob.near', 'profile/', 1, 123);

    expect(post).toHaveBeenCalledWith('/relay/execute?wait=true', {
      action: {
        type: 'set_permission',
        grantee: 'bob.near',
        path: 'profile/',
        level: 1,
        expires_at: 123,
      },
      target_account: 'core.onsocial.near',
    });
  });

  it('posts set_key_permission to /relay/execute?wait=true targeting the core contract', async () => {
    const post = vi.fn().mockResolvedValue({ txHash: 'tx-grant-key' });
    const permissions = new PermissionsModule({
      post,
      network: 'mainnet',
    } as never);

    await permissions.grantKey('ed25519:abc', 'settings/', 2);

    expect(post).toHaveBeenCalledWith('/relay/execute?wait=true', {
      action: {
        type: 'set_key_permission',
        public_key: 'ed25519:abc',
        path: 'settings/',
        level: 2,
      },
      target_account: 'core.onsocial.near',
    });
  });

  it('encodes read query parameters for account permission checks', async () => {
    const get = vi.fn().mockResolvedValue(true);
    const permissions = new PermissionsModule({
      get,
      network: 'mainnet',
    } as never);

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

  it('revoke is grant with level=0', async () => {
    const post = vi.fn().mockResolvedValue({ txHash: 'tx-revoke' });
    const permissions = new PermissionsModule({
      post,
      network: 'mainnet',
    } as never);

    await permissions.revoke('bob.near', 'profile/');

    expect(post).toHaveBeenCalledWith('/relay/execute?wait=true', {
      action: {
        type: 'set_permission',
        grantee: 'bob.near',
        path: 'profile/',
        level: 0,
      },
      target_account: 'core.onsocial.near',
    });
  });

  it('revokeKey is grantKey with level=0', async () => {
    const post = vi.fn().mockResolvedValue({ txHash: 'tx-revoke-key' });
    const permissions = new PermissionsModule({
      post,
      network: 'mainnet',
    } as never);

    await permissions.revokeKey('ed25519:abc', 'settings/');

    expect(post).toHaveBeenCalledWith('/relay/execute?wait=true', {
      action: {
        type: 'set_key_permission',
        public_key: 'ed25519:abc',
        path: 'settings/',
        level: 0,
      },
      target_account: 'core.onsocial.near',
    });
  });

  describe('grantOrPropose', () => {
    it('falls through to grant() for non-group paths', async () => {
      const post = vi.fn().mockResolvedValue({ txHash: 'tx-grant' });
      const get = vi.fn();
      const permissions = new PermissionsModule({
        post,
        get,
        network: 'mainnet',
      } as never);

      await permissions.grantOrPropose('bob.near', 'profile/', 1);

      expect(get).not.toHaveBeenCalled();
      expect(post).toHaveBeenCalledWith(
        '/relay/execute?wait=true',
        expect.objectContaining({
          action: expect.objectContaining({ type: 'set_permission' }),
        })
      );
    });

    it('uses direct grant on a non-member-driven group path', async () => {
      const post = vi.fn().mockResolvedValue({ txHash: 'tx-grant' });
      const get = vi.fn().mockResolvedValue({ member_driven: false });
      const permissions = new PermissionsModule({
        post,
        get,
        network: 'mainnet',
      } as never);

      await permissions.grantOrPropose('bob.near', 'groups/dao/content/', 1);

      expect(get).toHaveBeenCalledWith(expect.stringContaining('group-config'));
      expect(post).toHaveBeenCalledWith(
        '/relay/execute?wait=true',
        expect.objectContaining({
          action: expect.objectContaining({ type: 'set_permission' }),
        })
      );
    });

    it('files a path_permission_grant proposal in member-driven groups', async () => {
      const post = vi.fn().mockResolvedValue({ txHash: 'tx-proposal' });
      const get = vi.fn().mockResolvedValue({ member_driven: true });
      const permissions = new PermissionsModule({
        post,
        get,
        network: 'mainnet',
      } as never);

      await permissions.grantOrPropose('bob.near', 'groups/dao/content/', 2, {
        reason: 'promote',
      });

      expect(post).toHaveBeenCalledWith('/relay/execute?wait=true', {
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
        target_account: 'core.onsocial.near',
      });
    });

    it('files a path_permission_revoke proposal when level=0 in member-driven groups', async () => {
      const post = vi.fn().mockResolvedValue({ txHash: 'tx-proposal' });
      const get = vi.fn().mockResolvedValue({ member_driven: true });
      const permissions = new PermissionsModule({
        post,
        get,
        network: 'mainnet',
      } as never);

      await permissions.revokeOrPropose('bob.near', 'groups/dao/content/', {
        reason: 'demote',
      });

      expect(post).toHaveBeenCalledWith('/relay/execute?wait=true', {
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
        target_account: 'core.onsocial.near',
      });
    });
  });
});
