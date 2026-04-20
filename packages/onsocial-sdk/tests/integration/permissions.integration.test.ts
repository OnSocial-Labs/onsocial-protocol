// ---------------------------------------------------------------------------
// Integration: Permissions — grant account and key permissions
// ---------------------------------------------------------------------------

import { beforeAll, describe, expect, it } from 'vitest';
import type { OnSocial } from '../../src/client.js';
import { ACCOUNT_ID, confirmDirect, confirmIndexed, getClient, getKeypair } from './helpers.js';

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

    it('should emit a grant event via indexed permissionUpdates', async () => {
      const result = await confirmIndexed(
        async () => {
          const value = await os.query.graphql<{
            permissionUpdates: Array<{
              operation: string;
              author: string;
              targetId: string;
              path: string;
              level: number;
            }>;
          }>({
            query: `query PermissionGrant($author: String!, $grantee: String!, $path: String!) {
              permissionUpdates(
                where: {
                  author: {_eq: $author},
                  targetId: {_eq: $grantee},
                  path: {_eq: $path},
                  operation: {_eq: "grant"}
                },
                limit: 1,
                orderBy: [{blockHeight: DESC}]
              ) {
                operation
                author
                targetId
                path
                level
              }
            }`,
            variables: {
              author: ACCOUNT_ID,
              grantee,
              path: `${ACCOUNT_ID}/${path}`,
            },
          });
          const rows = value.data?.permissionUpdates ?? [];
          return rows[0] ?? null;
        },
        'permission grant event'
      );

      expect(result?.operation).toBe('grant');
      expect(result?.author).toBe(ACCOUNT_ID);
      expect(result?.targetId).toBe(grantee);
      expect(result?.path).toBe(`${ACCOUNT_ID}/${path}`);
      expect(result?.level).toBe(1);
    }, 35_000);

    it('should revoke the granted account permission', async () => {
      const result = await os.permissions.grant(grantee, path, 0);
      expect(result).toBeTruthy();
    });

    it('should expose the revoked account permission via read endpoints', async () => {
      const revoked = await confirmDirect(
        async () =>
          (!(await os.permissions.has(ACCOUNT_ID, grantee, path, 1)) ? true : null),
        'account permission revoked'
      );

      expect(revoked).toBe(true);
      expect(await os.permissions.get(ACCOUNT_ID, grantee, path)).toBe(0);
    }, 25_000);

    it('should emit a revoke event via indexed permissionUpdates', async () => {
      const result = await confirmIndexed(
        async () => {
          const value = await os.query.graphql<{
            permissionUpdates: Array<{
              operation: string;
              author: string;
              targetId: string;
              path: string;
              level: number;
              deleted: boolean;
            }>;
          }>({
            query: `query PermissionRevoke($author: String!, $grantee: String!, $path: String!) {
              permissionUpdates(
                where: {
                  author: {_eq: $author},
                  targetId: {_eq: $grantee},
                  path: {_eq: $path},
                  operation: {_eq: "revoke"}
                },
                limit: 1,
                orderBy: [{blockHeight: DESC}]
              ) {
                operation
                author
                targetId
                path
                level
                deleted
              }
            }`,
            variables: {
              author: ACCOUNT_ID,
              grantee,
              path: `${ACCOUNT_ID}/${path}`,
            },
          });
          const rows = value.data?.permissionUpdates ?? [];
          return rows[0] ?? null;
        },
        'permission revoke event'
      );

      expect(result?.operation).toBe('revoke');
      expect(result?.author).toBe(ACCOUNT_ID);
      expect(result?.targetId).toBe(grantee);
      expect(result?.path).toBe(`${ACCOUNT_ID}/${path}`);
      expect(result?.level).toBe(0);
      expect(result?.deleted).toBe(true);
    }, 35_000);
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

    it('should emit a key grant event via indexed permissionUpdates', async () => {
      const result = await confirmIndexed(
        async () => {
          const value = await os.query.graphql<{
            permissionUpdates: Array<{
              operation: string;
              author: string;
              path: string;
              level: number;
              targetId: string;
            }>;
          }>({
            query: `query KeyPermissionGrant($author: String!, $path: String!) {
              permissionUpdates(
                where: {
                  author: {_eq: $author},
                  path: {_eq: $path},
                  operation: {_in: ["grant_key", "key_grant"]}
                },
                limit: 1,
                orderBy: [{blockHeight: DESC}]
              ) {
                operation
                author
                path
                level
                targetId
              }
            }`,
            variables: { author: ACCOUNT_ID, path: `${ACCOUNT_ID}/${path}` },
          });
          const rows = value.data?.permissionUpdates ?? [];
          return rows[0] ?? null;
        },
        'key permission grant event'
      );

      expect(['grant_key', 'key_grant']).toContain(result?.operation ?? '');
      expect(result?.author).toBe(ACCOUNT_ID);
      expect(result?.path).toBe(`${ACCOUNT_ID}/${path}`);
      expect(result?.level).toBe(1);
      expect(result?.targetId ?? '').toBe('');
    }, 35_000);

    it('should revoke the granted key permission', async () => {
      const result = await os.permissions.grantKey(publicKey, path, 0);
      expect(result).toBeTruthy();
    });

    it('should expose the revoked key permission via read endpoints', async () => {
      const revoked = await confirmDirect(
        async () =>
          (!(await os.permissions.hasKeyPermission(ACCOUNT_ID, publicKey, path, 1))
            ? true
            : null),
        'key permission revoked'
      );

      expect(revoked).toBe(true);
      expect(await os.permissions.getKeyPermissions(ACCOUNT_ID, publicKey, path)).toBe(0);
    }, 25_000);

    it('should emit a key revoke event via indexed permissionUpdates', async () => {
      const result = await confirmIndexed(
        async () => {
          const value = await os.query.graphql<{
            permissionUpdates: Array<{
              operation: string;
              author: string;
              path: string;
              level: number;
              targetId: string;
              deleted: boolean;
            }>;
          }>({
            query: `query KeyPermissionRevoke($author: String!, $path: String!) {
              permissionUpdates(
                where: {
                  author: {_eq: $author},
                  path: {_eq: $path},
                  operation: {_in: ["revoke_key", "key_revoke"]}
                },
                limit: 1,
                orderBy: [{blockHeight: DESC}]
              ) {
                operation
                author
                path
                level
                targetId
                deleted
              }
            }`,
            variables: { author: ACCOUNT_ID, path: `${ACCOUNT_ID}/${path}` },
          });
          const rows = value.data?.permissionUpdates ?? [];
          return rows[0] ?? null;
        },
        'key permission revoke event'
      );

      expect(['revoke_key', 'key_revoke']).toContain(result?.operation ?? '');
      expect(result?.author).toBe(ACCOUNT_ID);
      expect(result?.path).toBe(`${ACCOUNT_ID}/${path}`);
      expect(result?.level).toBe(0);
      expect(result?.targetId ?? '').toBe('');
      expect(result?.deleted).toBe(true);
    }, 35_000);
  });
});