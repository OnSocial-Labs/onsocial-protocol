// ---------------------------------------------------------------------------
// Integration: Groups — create, read, membership, and indexed count
// ---------------------------------------------------------------------------

import { beforeAll, describe, expect, it } from 'vitest';
import { groupConfigV1 } from '../../src/schema/v1.js';
import type { OnSocial } from '../../src/client.js';
import {
  ACCOUNT_ID,
  confirmDirect,
  confirmIndexed,
  getClient,
} from './helpers.js';

describe('groups', () => {
  let os: OnSocial;
  const groupId = `grp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const memberId = 'onsocial.testnet';
  let groupCountBefore = 0;

  beforeAll(async () => {
    os = await getClient();
    groupCountBefore = await os.query.getGroupCount();
  });

  describe('create', () => {
    it('should create a group', async () => {
      const result = await os.groups.create(
        groupId,
        groupConfigV1({
          name: `Integration ${groupId}`,
          description: 'SDK integration test group',
          isPrivate: false,
          memberDriven: true,
          tags: ['integration', 'sdk'],
        })
      );

      expect(result).toBeTruthy();
    });

    it('should expose the group config via the data endpoint', async () => {
      const config = await confirmDirect(
        async () => {
          const value = await os.groups.getConfig(groupId);
          return value && value.name === `Integration ${groupId}` ? value : null;
        },
        'group config'
      );

      if (!config) throw new Error('group config missing');

      expect(config.name).toBe(`Integration ${groupId}`);
      expect(config.description).toBe('SDK integration test group');
      expect(config.isPrivate).toBe(false);
      expect(config.memberDriven).toBe(true);
    }, 25_000);

    it('should report the creator as owner', async () => {
      const isOwner = await confirmDirect(
        async () => ((await os.groups.isOwner(groupId, ACCOUNT_ID)) ? true : null),
        'group owner'
      );

      expect(isOwner).toBe(true);
    }, 25_000);

    it('should increase the indexed group count', async () => {
      const count = await confirmIndexed(
        async () => {
          const value = await os.query.getGroupCount();
          return value >= groupCountBefore + 1 ? value : null;
        },
        'group count'
      );

      expect(count).toBeGreaterThanOrEqual(groupCountBefore + 1);
    }, 35_000);

    it('should emit a create_group event via indexed groupUpdates', async () => {
      const result = await confirmIndexed(
        async () => {
          const value = await os.query.graphql<{
            groupUpdates: Array<{
              groupId: string;
              operation: string;
              author: string;
            }>;
          }>({
            query: `query GroupCreate($groupId: String!, $author: String!) {
              groupUpdates(
                where: {
                  groupId: {_eq: $groupId},
                  author: {_eq: $author},
                  operation: {_eq: "create_group"}
                },
                limit: 1,
                orderBy: [{blockHeight: DESC}]
              ) {
                groupId
                operation
                author
              }
            }`,
            variables: { groupId, author: ACCOUNT_ID },
          });
          const rows = value.data?.groupUpdates ?? [];
          return rows[0] ?? null;
        },
        'group create event'
      );

      expect(result?.groupId).toBe(groupId);
      expect(result?.operation).toBe('create_group');
      expect(result?.author).toBe(ACCOUNT_ID);
    }, 35_000);
  });

  describe('membership', () => {
    it('should add a member to the group', async () => {
      const result = await os.groups.addMember(groupId, memberId);
      expect(result).toBeTruthy();
    });

    it('should report the added account as a member', async () => {
      const isMember = await confirmDirect(
        async () => ((await os.groups.isMember(groupId, memberId)) ? true : null),
        'group member'
      );

      expect(isMember).toBe(true);
    }, 25_000);

    it('should return member details from the data endpoint', async () => {
      const member = await confirmDirect(
        async () => {
          const value = await os.groups.getMember(groupId, memberId);
          return value ? value : null;
        },
        'group member details'
      );

      expect(member).toBeTruthy();
      expect(typeof member).toBe('object');
    }, 25_000);

    it('should emit an add_member event via indexed groupUpdates', async () => {
      const result = await confirmIndexed(
        async () => {
          const value = await os.query.graphql<{
            groupUpdates: Array<{
              groupId: string;
              memberId: string;
              operation: string;
            }>;
          }>({
            query: `query GroupMemberAdded($groupId: String!, $memberId: String!) {
              groupUpdates(
                where: {
                  groupId: {_eq: $groupId},
                  memberId: {_eq: $memberId},
                  operation: {_eq: "add_member"}
                },
                limit: 1,
                orderBy: [{blockHeight: DESC}]
              ) {
                groupId
                memberId
                operation
              }
            }`,
            variables: { groupId, memberId },
          });
          const rows = value.data?.groupUpdates ?? [];
          return rows[0] ?? null;
        },
        'group add member event'
      );

      expect(result?.groupId).toBe(groupId);
      expect(result?.memberId).toBe(memberId);
      expect(result?.operation).toBe('add_member');
    }, 35_000);
  });
});