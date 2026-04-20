import { describe, expect, it, vi } from 'vitest';
import { PermissionsModule } from './permissions.js';

describe('PermissionsModule transport', () => {
  it('posts set_permission to /relay/execute targeting the core contract', async () => {
    const post = vi.fn().mockResolvedValue({ txHash: 'tx-grant' });
    const permissions = new PermissionsModule({
      post,
      network: 'mainnet',
    } as never);

    await permissions.grant('bob.near', 'profile/', 1, 123);

    expect(post).toHaveBeenCalledWith('/relay/execute', {
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

  it('posts set_key_permission to /relay/execute targeting the core contract', async () => {
    const post = vi.fn().mockResolvedValue({ txHash: 'tx-grant-key' });
    const permissions = new PermissionsModule({
      post,
      network: 'mainnet',
    } as never);

    await permissions.grantKey('ed25519:abc', 'settings/', 2);

    expect(post).toHaveBeenCalledWith('/relay/execute', {
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
});