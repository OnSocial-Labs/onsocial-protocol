// ---------------------------------------------------------------------------
// Integration: Permissions — grant account and key permissions
// ---------------------------------------------------------------------------

import { beforeAll, describe, expect, it } from 'vitest';
import type { OnSocial } from '../../src/client.js';
import {
  ACCOUNT_ID,
  confirmDirect,
  confirmIndexed,
  getClient,
  getClientForAccount,
  getKeypair,
} from './helpers.js';

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
        async () =>
          (await os.permissions.has(
            'test01.onsocial.testnet',
            grantee,
            path,
            1
          ))
            ? true
            : null,
        'account permission'
      );

      expect(allowed).toBe(true);
      expect(
        await os.permissions.get('test01.onsocial.testnet', grantee, path)
      ).toBe(1);
    }, 25_000);

    it('should emit a grant event via indexed permissionUpdates', async () => {
      const result = await confirmIndexed(async () => {
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
      }, 'permission grant event');

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
          !(await os.permissions.has(ACCOUNT_ID, grantee, path, 1))
            ? true
            : null,
        'account permission revoked'
      );

      expect(revoked).toBe(true);
      expect(await os.permissions.get(ACCOUNT_ID, grantee, path)).toBe(0);
    }, 25_000);

    it('should emit a revoke event via indexed permissionUpdates', async () => {
      const result = await confirmIndexed(async () => {
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
      }, 'permission revoke event');

      expect(result?.operation).toBe('revoke');
      expect(result?.author).toBe(ACCOUNT_ID);
      expect(result?.targetId).toBe(grantee);
      expect(result?.path).toBe(`${ACCOUNT_ID}/${path}`);
      expect(result?.level).toBe(0);
      expect(result?.deleted).toBe(true);
    }, 35_000);
  });

  describe('group role permissions', () => {
    const groupId = `grp_permissions_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const moderatorId = 'test02.onsocial.testnet';
    const memberId = 'test03.onsocial.testnet';
    const configPath = `groups/${groupId}/config`;

    it('should create a group for role permission checks', async () => {
      const result = await os.groups.create(groupId, {
        v: 1,
        name: `Permissions ${groupId}`,
        description: 'SDK integration permission role test group',
        isPrivate: true,
        memberDriven: false,
        tags: ['integration', 'permissions'],
      });

      expect(result).toBeTruthy();
    }, 25_000);

    it('should report the owner as group admin and moderate', async () => {
      const state = await confirmDirect(async () => {
        const [isAdmin, canModerate] = await Promise.all([
          os.permissions.hasGroupAdmin(groupId, ACCOUNT_ID),
          os.permissions.hasGroupModerate(groupId, ACCOUNT_ID),
        ]);

        return isAdmin && canModerate ? { isAdmin, canModerate } : null;
      }, 'owner role permissions');

      expect(state?.isAdmin).toBe(true);
      expect(state?.canModerate).toBe(true);
    }, 25_000);

    it('should add a moderator candidate and a basic member', async () => {
      const [moderatorResult, memberResult] = await Promise.all([
        os.groups.addMember(groupId, moderatorId),
        os.groups.addMember(groupId, memberId),
      ]);

      expect(moderatorResult).toBeTruthy();
      expect(memberResult).toBeTruthy();
    }, 25_000);

    it('should report basic members as neither admin nor moderator before delegation', async () => {
      const state = await confirmDirect(async () => {
        const [memberAdmin, memberModerate] = await Promise.all([
          os.permissions.hasGroupAdmin(groupId, memberId),
          os.permissions.hasGroupModerate(groupId, memberId),
        ]);

        return !memberAdmin && !memberModerate
          ? { memberAdmin, memberModerate }
          : null;
      }, 'basic member role permissions');

      expect(state?.memberAdmin).toBe(false);
      expect(state?.memberModerate).toBe(false);
    }, 25_000);

    it('should delegate MODERATE permission on the group config path', async () => {
      const result = await os.permissions.grant(moderatorId, configPath, 2);
      expect(result).toBeTruthy();
    });

    it('should expose the delegated moderator as moderate but not admin', async () => {
      const state = await confirmDirect(async () => {
        const [isAdmin, canModerate, level] = await Promise.all([
          os.permissions.hasGroupAdmin(groupId, moderatorId),
          os.permissions.hasGroupModerate(groupId, moderatorId),
          os.permissions.get(ACCOUNT_ID, moderatorId, configPath),
        ]);

        return !isAdmin && canModerate && level === 2
          ? { isAdmin, canModerate, level }
          : null;
      }, 'delegated moderator role permissions');

      expect(state?.isAdmin).toBe(false);
      expect(state?.canModerate).toBe(true);
      expect(state?.level).toBe(2);
    }, 25_000);

    it('should emit an indexed permission grant for the delegated moderator config path', async () => {
      const result = await confirmIndexed(async () => {
        const value = await os.query.graphql<{
          permissionUpdates: Array<{
            operation: string;
            author: string;
            targetId: string;
            path: string;
            level: number;
          }>;
        }>({
          query: `query GroupConfigPermissionGrant($author: String!, $grantee: String!, $path: String!) {
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
            grantee: moderatorId,
            path: configPath,
          },
        });
        return value.data?.permissionUpdates?.[0] ?? null;
      }, 'group config permission grant event');

      expect(result?.operation).toBe('grant');
      expect(result?.author).toBe(ACCOUNT_ID);
      expect(result?.targetId).toBe(moderatorId);
      expect(result?.path).toBe(configPath);
      expect(result?.level).toBe(2);
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
          (await os.permissions.hasKeyPermission(
            'test01.onsocial.testnet',
            publicKey,
            path,
            1
          ))
            ? true
            : null,
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
      const result = await confirmIndexed(async () => {
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
      }, 'key permission grant event');

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
          !(await os.permissions.hasKeyPermission(
            ACCOUNT_ID,
            publicKey,
            path,
            1
          ))
            ? true
            : null,
        'key permission revoked'
      );

      expect(revoked).toBe(true);
      expect(
        await os.permissions.getKeyPermissions(ACCOUNT_ID, publicKey, path)
      ).toBe(0);
    }, 25_000);

    it('should emit a key revoke event via indexed permissionUpdates', async () => {
      const result = await confirmIndexed(async () => {
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
      }, 'key permission revoke event');

      expect(['revoke_key', 'key_revoke']).toContain(result?.operation ?? '');
      expect(result?.author).toBe(ACCOUNT_ID);
      expect(result?.path).toBe(`${ACCOUNT_ID}/${path}`);
      expect(result?.level).toBe(0);
      expect(result?.targetId ?? '').toBe('');
      expect(result?.deleted).toBe(true);
    }, 35_000);
  });

  describe('member-driven group permission routing', () => {
    const WRITE_SENDER = 'test03.onsocial.testnet';
    const groupId = `grp_md_perm_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    // Use the owner as the grantee — only existing members can be the
    // target of a path_permission_grant in member-driven groups, and the
    // owner is auto-enrolled at create time.
    const grantee = WRITE_SENDER;
    const targetPath = `groups/${groupId}/content/`;
    let senderOs: OnSocial;

    beforeAll(async () => {
      senderOs = await getClientForAccount(WRITE_SENDER);
    });

    it('creates a member-driven group', async () => {
      const result = await senderOs.groups.create(groupId, {
        v: 1,
        name: `MD ${groupId}`,
        description: 'SDK member-driven permission routing test',
        isPrivate: true, // Contract enforces: member-driven groups must be private.
        memberDriven: true,
        tags: ['integration', 'permissions', 'member-driven'],
      });
      expect(result).toBeTruthy();
    }, 25_000);

    it('reports the group as member-driven via os.groups.isMemberDriven', async () => {
      const flag = await confirmDirect(
        async () => ((await os.groups.isMemberDriven(groupId)) ? true : null),
        'group reports member-driven'
      );
      expect(flag).toBe(true);
    }, 25_000);

    it('direct grant() on a groups/{id}/... path is rejected on-chain', async () => {
      // Member-driven groups force governance — even the owner cannot grant
      // directly. The SDK uses wait=true so the on-chain revert surfaces here.
      await expect(
        senderOs.permissions.grant(grantee, targetPath, 1)
      ).rejects.toThrow(/member-driven|governance|proposal/i);
    }, 25_000);

    it('grantOrPropose auto-files a path_permission_grant proposal instead', async () => {
      const result = await senderOs.permissions.grantOrPropose(
        grantee,
        targetPath,
        1,
        { reason: 'integration auto-route' }
      );
      expect(result).toBeTruthy();
    }, 25_000);
  });
});
