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
  getClientForAccount,
  testId,
} from './helpers.js';

describe('groups', () => {
  let os: OnSocial;
  let requesterOs: OnSocial;
  let rejectRequesterOs: OnSocial;
  let cancelRequesterOs: OnSocial;
  const groupId = `grp_${testId()}`;
  const moderationGroupId = `grp_moderation_${testId()}`;
  const memberId = 'onsocial.testnet';
  const requesterId = 'test02.onsocial.testnet';
  const rejectRequesterId = 'test03.onsocial.testnet';
  const cancelRequesterId = 'test04.onsocial.testnet';
  let groupCountBefore = 0;

  beforeAll(async () => {
    os = await getClient();
    requesterOs = await getClientForAccount(requesterId);
    rejectRequesterOs = await getClientForAccount(rejectRequesterId);
    cancelRequesterOs = await getClientForAccount(cancelRequesterId);
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

  describe('lifecycle and moderation', () => {
    it('should create a second group for moderation flows', async () => {
      const result = await os.groups.create(
        moderationGroupId,
        groupConfigV1({
          name: `Integration ${moderationGroupId}`,
          description: 'SDK integration test moderation group',
          isPrivate: false,
          memberDriven: false,
          tags: ['integration', 'sdk', 'moderation'],
        })
      );

      expect(result).toBeTruthy();

      const config = await confirmDirect(
        async () => {
          const value = await os.groups.getConfig(moderationGroupId);
          return value?.name === `Integration ${moderationGroupId}` ? value : null;
        },
        'moderation group config'
      );

      expect(config?.name).toBe(`Integration ${moderationGroupId}`);
    });

    it('should let a second actor join the moderation group directly', async () => {
      const result = await requesterOs.groups.join(moderationGroupId);
      expect(result).toBeTruthy();
    });

    it('should expose the joined requester as a member', async () => {
      const member = await confirmDirect(
        async () => {
          const [isMember, value] = await Promise.all([
            os.groups.isMember(moderationGroupId, requesterId),
            os.groups.getMember(moderationGroupId, requesterId),
          ]);
          return isMember && value ? value : null;
        },
        'joined moderation member'
      );

      expect(member).toBeTruthy();
      expect(typeof member).toBe('object');
    }, 25_000);

    it('should emit an add_member event for the joined requester via indexed groupUpdates', async () => {
      const result = await confirmIndexed(
        async () => {
          const value = await os.query.graphql<{
            groupUpdates: Array<{
              groupId: string;
              memberId: string;
              operation: string;
              author: string;
            }>;
          }>({
            query: `query GroupRequesterJoined($groupId: String!, $memberId: String!, $author: String!) {
              groupUpdates(
                where: {
                  groupId: {_eq: $groupId},
                  memberId: {_eq: $memberId},
                  author: {_eq: $author},
                  operation: {_eq: "add_member"}
                },
                limit: 1,
                orderBy: [{blockHeight: DESC}]
              ) {
                groupId
                memberId
                operation
                author
              }
            }`,
            variables: { groupId: moderationGroupId, memberId: requesterId, author: requesterId },
          });
          const rows = value.data?.groupUpdates ?? [];
          return rows[0] ?? null;
        },
        'requester joined event',
        { timeoutMs: 45_000, intervalMs: 3_000 }
      );

      expect(result?.groupId).toBe(moderationGroupId);
      expect(result?.memberId).toBe(requesterId);
      expect(result?.author).toBe(requesterId);
      expect(result?.operation).toBe('add_member');
    }, 35_000);

    it('should let the joined requester leave the moderation group', async () => {
      const result = await requesterOs.groups.leave(moderationGroupId);
      expect(result).toBeTruthy();
    });

    it('should remove the leaver from the member set', async () => {
      const state = await confirmDirect(
        async () => {
          const value = await os.groups.isMember(moderationGroupId, requesterId);
          return value ? null : { isMember: value };
        },
        'member leave'
      );

      expect(state?.isMember).toBe(false);
    }, 25_000);

    it('should emit a remove_member event for the leaving actor via indexed groupUpdates', async () => {
      const result = await confirmIndexed(
        async () => {
          const value = await os.query.graphql<{
            groupUpdates: Array<{
              groupId: string;
              memberId: string;
              operation: string;
              author: string;
            }>;
          }>({
            query: `query GroupRequesterLeft($groupId: String!, $memberId: String!, $author: String!) {
              groupUpdates(
                where: {
                  groupId: {_eq: $groupId},
                  memberId: {_eq: $memberId},
                  author: {_eq: $author},
                  operation: {_eq: "remove_member"}
                },
                limit: 1,
                orderBy: [{blockHeight: DESC}]
              ) {
                groupId
                memberId
                operation
                author
              }
            }`,
            variables: { groupId: moderationGroupId, memberId: requesterId, author: requesterId },
          });
          const rows = value.data?.groupUpdates ?? [];
          return rows[0] ?? null;
        },
        'requester left event',
        { timeoutMs: 45_000, intervalMs: 3_000 }
      );

      expect(result?.groupId).toBe(moderationGroupId);
      expect(result?.memberId).toBe(requesterId);
      expect(result?.author).toBe(requesterId);
      expect(result?.operation).toBe('remove_member');
    }, 35_000);

    it('should let the owner toggle group privacy on', async () => {
      const result = await os.groups.setPrivacy(moderationGroupId, true);
      expect(result).toBeTruthy();
    });

    it('should expose the group as private after the toggle', async () => {
      const config = await confirmDirect(
        async () => {
          const value = await os.groups.getConfig(moderationGroupId);
          return value?.is_private === true ? value : null;
        },
        'private group config'
      );

      expect(config?.is_private).toBe(true);
    }, 25_000);

    it('should emit a privacy_changed event via indexed groupUpdates', async () => {
      const result = await confirmIndexed(
        async () => {
          const value = await os.query.graphql<{
            groupUpdates: Array<{
              groupId: string;
              memberId: string;
              operation: string;
              author: string;
            }>;
          }>({
            query: `query GroupPrivacyChanged($groupId: String!, $author: String!) {
              groupUpdates(
                where: {
                  groupId: {_eq: $groupId},
                  author: {_eq: $author},
                  operation: {_eq: "privacy_changed"}
                },
                limit: 1,
                orderBy: [{blockHeight: DESC}]
              ) {
                groupId
                operation
                author
                path
              }
            }`,
            variables: {
              groupId: moderationGroupId,
              author: ACCOUNT_ID,
            },
          });
          const rows = value.data?.groupUpdates ?? [];
          return rows[0] ?? null;
        },
        'privacy changed event'
      );

      expect(result?.groupId).toBe(moderationGroupId);
      expect(result?.author).toBe(ACCOUNT_ID);
      expect(result?.operation).toBe('privacy_changed');
    }, 35_000);

    it('should let the owner add a member for moderation tests', async () => {
      const result = await os.groups.addMember(moderationGroupId, rejectRequesterId);
      expect(result).toBeTruthy();
    });

    it('should blacklist that member', async () => {
      const result = await os.groups.blacklist(moderationGroupId, rejectRequesterId);
      expect(result).toBeTruthy();
    });

    it('should expose the member as blacklisted', async () => {
      const isBlacklisted = await confirmDirect(
        async () => {
          const value = await os.groups.isBlacklisted(
            moderationGroupId,
            rejectRequesterId
          );
          return value ? true : null;
        },
        'blacklisted member'
      );

      expect(isBlacklisted).toBe(true);
    }, 25_000);

    it('should emit an add_to_blacklist event via indexed groupUpdates', async () => {
      const result = await confirmIndexed(
        async () => {
          const value = await os.query.graphql<{
            groupUpdates: Array<{
              groupId: string;
              memberId: string;
              operation: string;
              author: string;
            }>;
          }>({
            query: `query GroupBlacklisted($groupId: String!, $memberId: String!, $author: String!) {
              groupUpdates(
                where: {
                  groupId: {_eq: $groupId},
                  memberId: {_eq: $memberId},
                  author: {_eq: $author},
                  operation: {_eq: "add_to_blacklist"}
                },
                limit: 1,
                orderBy: [{blockHeight: DESC}]
              ) {
                groupId
                memberId
                operation
                author
              }
            }`,
            variables: {
              groupId: moderationGroupId,
              memberId: rejectRequesterId,
              author: ACCOUNT_ID,
            },
          });
          const rows = value.data?.groupUpdates ?? [];
          return rows[0] ?? null;
        },
        'blacklist event'
      );

      expect(result?.groupId).toBe(moderationGroupId);
      expect(result?.memberId).toBe(rejectRequesterId);
      expect(result?.author).toBe(ACCOUNT_ID);
      expect(result?.operation).toBe('add_to_blacklist');
    }, 35_000);

    it('should unblacklist that member', async () => {
      const result = await os.groups.unblacklist(moderationGroupId, rejectRequesterId);
      expect(result).toBeTruthy();
    });

    it('should expose the member as no longer blacklisted', async () => {
      const state = await confirmDirect(
        async () => {
          const value = await os.groups.isBlacklisted(
            moderationGroupId,
            rejectRequesterId
          );
          return value ? null : { isBlacklisted: value };
        },
        'unblacklisted member'
      );

      expect(state?.isBlacklisted).toBe(false);
    }, 25_000);

    it('should emit a remove_from_blacklist event via indexed groupUpdates', async () => {
      const result = await confirmIndexed(
        async () => {
          const value = await os.query.graphql<{
            groupUpdates: Array<{
              groupId: string;
              memberId: string;
              operation: string;
              author: string;
            }>;
          }>({
            query: `query GroupUnblacklisted($groupId: String!, $memberId: String!, $author: String!) {
              groupUpdates(
                where: {
                  groupId: {_eq: $groupId},
                  memberId: {_eq: $memberId},
                  author: {_eq: $author},
                  operation: {_eq: "remove_from_blacklist"}
                },
                limit: 1,
                orderBy: [{blockHeight: DESC}]
              ) {
                groupId
                memberId
                operation
                author
              }
            }`,
            variables: {
              groupId: moderationGroupId,
              memberId: rejectRequesterId,
              author: ACCOUNT_ID,
            },
          });
          const rows = value.data?.groupUpdates ?? [];
          return rows[0] ?? null;
        },
        'unblacklist event'
      );

      expect(result?.groupId).toBe(moderationGroupId);
      expect(result?.memberId).toBe(rejectRequesterId);
      expect(result?.author).toBe(ACCOUNT_ID);
      expect(result?.operation).toBe('remove_from_blacklist');
    }, 35_000);

    it('should let the owner add another member for removal coverage', async () => {
      const result = await os.groups.addMember(moderationGroupId, cancelRequesterId);
      expect(result).toBeTruthy();
    });

    it('should remove that member as the owner', async () => {
      const result = await os.groups.removeMember(
        moderationGroupId,
        cancelRequesterId
      );
      expect(result).toBeTruthy();
    });

    it('should expose the removed member as absent from the member set', async () => {
      const state = await confirmDirect(
        async () => {
          const value = await os.groups.isMember(
            moderationGroupId,
            cancelRequesterId
          );
          return value ? null : { isMember: value };
        },
        'owner removed member'
      );

      expect(state?.isMember).toBe(false);
    }, 25_000);

  });
});