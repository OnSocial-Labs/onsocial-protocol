// ---------------------------------------------------------------------------
// Integration: Permissions — grant account and key permissions
// ---------------------------------------------------------------------------

import { beforeAll, describe, expect, it } from 'vitest';
import type { OnSocial } from '../../src/client.js';
import { confirmDirect, getClient, getKeypair } from './helpers.js';

describe('permissions', () => {
  let os: OnSocial;

  beforeAll(async () => {
    os = await getClient();
  });

  describe('account permissions', () => {
    const grantee = 'onsocial.testnet';
    const path = `sdk_permissions_${Date.now()}_${Math.random().toString(36).slice(2, 8)}/`;

    it('should grant a permission to another account', async () => {
      const result = await os.permissions.grant(grantee, path, 1);
      expect(result).toBeTruthy();
    });

    it('should expose the granted permission via read endpoints', async () => {
      const allowed = await confirmDirect(
        async () => ((await os.permissions.has('test01.onsocial.testnet', grantee, path, 1)) ? true : null),
        'account permission'
      );

      expect(allowed).toBe(true);
      expect(await os.permissions.get('test01.onsocial.testnet', grantee, path)).toBe(1);
    }, 25_000);
  });

  describe('key permissions', () => {
    const { publicKey } = getKeypair();
    const path = `sdk_key_permissions_${Date.now()}_${Math.random().toString(36).slice(2, 8)}/`;

    it('should grant a permission to a public key', async () => {
      const result = await os.permissions.grantKey(publicKey, path, 1);
      expect(result).toBeTruthy();
    });

    it('should expose the granted key permission via read endpoints', async () => {
      const allowed = await confirmDirect(
        async () =>
          ((await os.permissions.hasKeyPermission(
            'test01.onsocial.testnet',
            publicKey,
            path,
            1
          ))
            ? true
            : null),
        'key permission'
      );

      expect(allowed).toBe(true);
      expect(
        await os.permissions.getKeyPermissions(
          'test01.onsocial.testnet',
          publicKey,
          path
        )
      ).toBe(1);
    }, 25_000);
  });
});