// ---------------------------------------------------------------------------
// Integration: Permissions — grant account and key permissions
// ---------------------------------------------------------------------------

import { beforeAll, describe, expect, it } from 'vitest';
import type { OnSocial } from '../../src/client.js';
import {
  ACCOUNT_ID,
  confirmDirect,
  getRelayedClient,
  getKeypair,
} from './helpers.js';
import { NeedsWalletConfirmationError } from '../../src/advanced/session.js';

describe('permissions', () => {
  let os: OnSocial;

  beforeAll(async () => {
    os = await getRelayedClient();
  });

  describe('account permissions', () => {
    const grantee = 'onsocial.testnet';
    const path = `sdk_permissions_${Date.now()}_${Math.random().toString(36).slice(2, 8)}/`;

    it('grant requires an explicit wallet broadcast', async () => {
      await expect(
        os.permissions.grant(grantee, path, 1)
      ).rejects.toBeInstanceOf(NeedsWalletConfirmationError);
      expect(await os.permissions.has(ACCOUNT_ID, grantee, path, 1)).toBe(
        false
      );
    });

    it('revoke requires an explicit wallet broadcast', async () => {
      await expect(os.permissions.revoke(grantee, path)).rejects.toBeInstanceOf(
        NeedsWalletConfirmationError
      );
    });
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

    it('direct group permission delegation requires wallet broadcast', async () => {
      await expect(
        os.permissions.grant(moderatorId, configPath, 2)
      ).rejects.toBeInstanceOf(NeedsWalletConfirmationError);
    });
  });

  describe('key permissions', () => {
    const { publicKey } = getKeypair();
    const path = `sdk_key_permissions_${Date.now()}_${Math.random().toString(36).slice(2, 8)}/`;

    it('grantKey requires an explicit wallet broadcast', async () => {
      await expect(
        os.permissions.grantKey(publicKey, path, 1)
      ).rejects.toBeInstanceOf(NeedsWalletConfirmationError);
    });

    it('revokeKey requires an explicit wallet broadcast', async () => {
      await expect(
        os.permissions.revokeKey(publicKey, path)
      ).rejects.toBeInstanceOf(NeedsWalletConfirmationError);
    });
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
      senderOs = await getRelayedClient(WRITE_SENDER);
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

    it('direct grant() on a groups/{id}/... path requires wallet broadcast', async () => {
      await expect(
        senderOs.permissions.grant(grantee, targetPath, 1)
      ).rejects.toBeInstanceOf(NeedsWalletConfirmationError);
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
