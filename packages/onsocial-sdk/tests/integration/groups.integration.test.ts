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
  const executeGroupId = `grp_execute_${testId()}`;
  const moderationGroupId = `grp_moderation_${testId()}`;
  const joinRequestGroupId = `grp_join_requests_${testId()}`;
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
    groupCountBefore = await os.query.stats.groupCount();
  });

  describe('create', () => {
    it('should create a group', async () => {
      const result = await os.groups.create(
        groupId,
        groupConfigV1({
          name: `Integration ${groupId}`,
          description: 'SDK integration test group',
          isPrivate: false,
          memberDriven: false,
          tags: ['integration', 'sdk'],
        })
      );

      expect(result).toBeTruthy();
    }, 20_000);

    it('should expose the group config via the data endpoint', async () => {
      const config = await confirmDirect(async () => {
        const value = await os.groups.getConfig(groupId);
        return value && value.name === `Integration ${groupId}` ? value : null;
      }, 'group config');

      if (!config) throw new Error('group config missing');

      expect(config.name).toBe(`Integration ${groupId}`);
      expect(config.description).toBe('SDK integration test group');
      expect(config.isPrivate ?? config.is_private).toBe(false);
      expect(config.memberDriven ?? config.member_driven).toBe(false);
    }, 45_000);

    it('should report the creator as owner', async () => {
      const isOwner = await confirmDirect(
        async () =>
          (await os.groups.isOwner(groupId, ACCOUNT_ID)) ? true : null,
        'group owner'
      );

      expect(isOwner).toBe(true);
    }, 25_000);

    it('should increase the indexed group count', async () => {
      const count = await confirmIndexed(async () => {
        const value = await os.query.stats.groupCount();
        return value >= groupCountBefore + 1 ? value : null;
      }, 'group count');

      expect(count).toBeGreaterThanOrEqual(groupCountBefore + 1);
    }, 35_000);

    it('should emit a create_group event via indexed groupUpdates', async () => {
      const result = await confirmIndexed(async () => {
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
      }, 'group create event');

      expect(result?.groupId).toBe(groupId);
      expect(result?.operation).toBe('create_group');
      expect(result?.author).toBe(ACCOUNT_ID);
    }, 35_000);

    it('should create a group via os.execute when targeting the core contract explicitly', async () => {
      const result = await os.execute(
        {
          type: 'create_group',
          group_id: executeGroupId,
          config: {
            v: 1,
            name: `Integration ${executeGroupId}`,
            description: 'SDK integration execute test group',
            is_private: false,
            member_driven: false,
            tags: ['integration', 'sdk', 'execute'],
          },
        },
        { targetAccount: 'core.onsocial.testnet' }
      );

      expect(result.txHash).toBeTruthy();
    }, 25_000);

    it('should expose the execute-created group via regular group reads', async () => {
      const config = await confirmDirect(async () => {
        const value = await os.groups.getConfig(executeGroupId);
        return value?.name === `Integration ${executeGroupId}` ? value : null;
      }, 'execute-created group config');

      expect(config?.name).toBe(`Integration ${executeGroupId}`);
      expect(config?.description).toBe('SDK integration execute test group');
      expect(config?.is_private).toBe(false);
    }, 25_000);

    it('should emit a create_group event for the execute-created group via indexed groupUpdates', async () => {
      const result = await confirmIndexed(async () => {
        const value = await os.query.graphql<{
          groupUpdates: Array<{
            groupId: string;
            operation: string;
            author: string;
          }>;
        }>({
          query: `query ExecuteGroupCreate($groupId: String!, $author: String!) {
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
          variables: { groupId: executeGroupId, author: ACCOUNT_ID },
        });
        return value.data?.groupUpdates?.[0] ?? null;
      }, 'execute-created group event');

      expect(result?.groupId).toBe(executeGroupId);
      expect(result?.operation).toBe('create_group');
      expect(result?.author).toBe(ACCOUNT_ID);
    }, 35_000);
  });

  describe('membership', () => {
    it('should add a member to the group', async () => {
      const result = await os.groups.addMember(groupId, memberId);
      expect(result).toBeTruthy();
    }, 20_000);

    it('should report the added account as a member', async () => {
      const isMember = await confirmDirect(
        async () =>
          (await os.groups.isMember(groupId, memberId)) ? true : null,
        'group member'
      );

      expect(isMember).toBe(true);
    }, 25_000);

    it('should return member details from the data endpoint', async () => {
      const member = await confirmDirect(async () => {
        const value = await os.groups.getMember(groupId, memberId);
        return value ? value : null;
      }, 'group member details');

      expect(member).toBeTruthy();
      expect(typeof member).toBe('object');
    }, 25_000);

    it('should emit an add_member event via indexed groupUpdates', async () => {
      const result = await confirmIndexed(async () => {
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
      }, 'group add member event');

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

      const config = await confirmDirect(async () => {
        const value = await os.groups.getConfig(moderationGroupId);
        return value?.name === `Integration ${moderationGroupId}`
          ? value
          : null;
      }, 'moderation group config');

      expect(config?.name).toBe(`Integration ${moderationGroupId}`);
    }, 25_000);

    it('should let a second actor join the moderation group directly', async () => {
      const result = await requesterOs.groups.join(moderationGroupId);
      expect(result).toBeTruthy();
    }, 20_000);

    it('should expose the joined requester as a member', async () => {
      const member = await confirmDirect(async () => {
        const [isMember, value] = await Promise.all([
          os.groups.isMember(moderationGroupId, requesterId),
          os.groups.getMember(moderationGroupId, requesterId),
        ]);
        return isMember && value ? value : null;
      }, 'joined moderation member');

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
            variables: {
              groupId: moderationGroupId,
              memberId: requesterId,
              author: requesterId,
            },
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
    }, 20_000);

    it('should remove the leaver from the member set', async () => {
      const state = await confirmDirect(async () => {
        const value = await os.groups.isMember(moderationGroupId, requesterId);
        return value ? null : { isMember: value };
      }, 'member leave');

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
            variables: {
              groupId: moderationGroupId,
              memberId: requesterId,
              author: requesterId,
            },
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
    }, 20_000);

    it('should expose the group as private after the toggle', async () => {
      const config = await confirmDirect(async () => {
        const value = await os.groups.getConfig(moderationGroupId);
        return value?.is_private === true ? value : null;
      }, 'private group config');

      expect(config?.is_private).toBe(true);
    }, 25_000);

    it('should emit a privacy_changed event via indexed groupUpdates', async () => {
      const result = await confirmIndexed(async () => {
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
      }, 'privacy changed event');

      expect(result?.groupId).toBe(moderationGroupId);
      expect(result?.author).toBe(ACCOUNT_ID);
      expect(result?.operation).toBe('privacy_changed');
    }, 35_000);

    it('should let the owner add a member for moderation tests', async () => {
      const result = await os.groups.addMember(
        moderationGroupId,
        rejectRequesterId
      );
      expect(result).toBeTruthy();
    }, 20_000);

    it('should blacklist that member', async () => {
      const result = await os.groups.blacklist(
        moderationGroupId,
        rejectRequesterId
      );
      expect(result).toBeTruthy();
    }, 20_000);

    it('should expose the member as blacklisted', async () => {
      const isBlacklisted = await confirmDirect(async () => {
        const value = await os.groups.isBlacklisted(
          moderationGroupId,
          rejectRequesterId
        );
        return value ? true : null;
      }, 'blacklisted member');

      expect(isBlacklisted).toBe(true);
    }, 25_000);

    it('should emit an add_to_blacklist event via indexed groupUpdates', async () => {
      const result = await confirmIndexed(async () => {
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
      }, 'blacklist event');

      expect(result?.groupId).toBe(moderationGroupId);
      expect(result?.memberId).toBe(rejectRequesterId);
      expect(result?.author).toBe(ACCOUNT_ID);
      expect(result?.operation).toBe('add_to_blacklist');
    }, 35_000);

    it('should unblacklist that member', async () => {
      const result = await os.groups.unblacklist(
        moderationGroupId,
        rejectRequesterId
      );
      expect(result).toBeTruthy();
    }, 20_000);

    it('should expose the member as no longer blacklisted', async () => {
      const state = await confirmDirect(async () => {
        const value = await os.groups.isBlacklisted(
          moderationGroupId,
          rejectRequesterId
        );
        return value ? null : { isBlacklisted: value };
      }, 'unblacklisted member');

      expect(state?.isBlacklisted).toBe(false);
    }, 25_000);

    it('should emit a remove_from_blacklist event via indexed groupUpdates', async () => {
      const result = await confirmIndexed(async () => {
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
      }, 'unblacklist event');

      expect(result?.groupId).toBe(moderationGroupId);
      expect(result?.memberId).toBe(rejectRequesterId);
      expect(result?.author).toBe(ACCOUNT_ID);
      expect(result?.operation).toBe('remove_from_blacklist');
    }, 35_000);

    it('should let the owner add another member for removal coverage', async () => {
      const result = await os.groups.addMember(
        moderationGroupId,
        cancelRequesterId
      );
      expect(result).toBeTruthy();
    }, 20_000);

    it('should remove that member as the owner', async () => {
      const result = await os.groups.removeMember(
        moderationGroupId,
        cancelRequesterId
      );
      expect(result).toBeTruthy();
    }, 20_000);

    it('should expose the removed member as absent from the member set', async () => {
      const state = await confirmDirect(async () => {
        const value = await os.groups.isMember(
          moderationGroupId,
          cancelRequesterId
        );
        return value ? null : { isMember: value };
      }, 'owner removed member');

      expect(state?.isMember).toBe(false);
    }, 25_000);
  });

  describe('join requests', () => {
    const groupPostId = testId();
    const groupReplyId = testId();
    const groupQuoteId = testId();

    it('should create a private group for join-request flows', async () => {
      const result = await os.groups.create(
        joinRequestGroupId,
        groupConfigV1({
          name: `Integration ${joinRequestGroupId}`,
          description: 'SDK integration test join-request group',
          isPrivate: true,
          memberDriven: false,
          tags: ['integration', 'sdk', 'private'],
        })
      );

      expect(result).toBeTruthy();

      const config = await confirmDirect(async () => {
        const value = await os.groups.getConfig(joinRequestGroupId);
        return value?.is_private === true ? value : null;
      }, 'join-request group config');

      expect(config?.is_private).toBe(true);
    }, 25_000);

    it('should expose initial private-group stats', async () => {
      const stats = await confirmDirect(async () => {
        const value = await os.groups.getStats(joinRequestGroupId);
        return value ? value : null;
      }, 'initial join-request group stats');

      expect(stats).toBeTruthy();
      expect(Number(stats?.total_join_requests ?? 0)).toBe(0);
    }, 25_000);

    it('should let a requester submit a pending join request', async () => {
      const result = await requesterOs.groups.join(joinRequestGroupId);
      expect(result).toBeTruthy();
    }, 20_000);

    it('should expose the pending join request via getJoinRequest and getStats', async () => {
      const state = await confirmDirect(async () => {
        const [request, stats, isMember] = await Promise.all([
          os.groups.getJoinRequest(joinRequestGroupId, requesterId),
          os.groups.getStats(joinRequestGroupId),
          os.groups.isMember(joinRequestGroupId, requesterId),
        ]);

        return request &&
          !isMember &&
          Number(stats?.total_join_requests ?? 0) >= 1
          ? { request, stats, isMember }
          : null;
      }, 'pending join request');

      if (!state?.stats) throw new Error('pending join request stats missing');
      expect(state?.isMember).toBe(false);
      expect(state?.request.requester_id).toBe(requesterId);
      expect(state?.request.status).toBe('pending');
      expect(
        Number(state.stats.total_join_requests ?? 0)
      ).toBeGreaterThanOrEqual(1);
    }, 25_000);

    it('should approve the pending join request', async () => {
      const result = await os.groups.approveJoin(
        joinRequestGroupId,
        requesterId
      );
      expect(result).toBeTruthy();
    }, 20_000);

    it('should add the approved requester as a member', async () => {
      const state = await confirmDirect(async () => {
        const [isMember, stats] = await Promise.all([
          os.groups.isMember(joinRequestGroupId, requesterId),
          os.groups.getStats(joinRequestGroupId),
        ]);

        return isMember && Number(stats?.total_join_requests ?? 0) === 0
          ? { isMember, stats }
          : null;
      }, 'approved join request');

      expect(state?.isMember).toBe(true);
      expect(Number(state?.stats?.total_join_requests ?? 0)).toBe(0);
    }, 25_000);

    it('should let another requester submit a join request for rejection', async () => {
      const result = await rejectRequesterOs.groups.join(joinRequestGroupId);
      expect(result).toBeTruthy();
    }, 20_000);

    it('should reject that pending join request', async () => {
      const result = await os.groups.rejectJoin(
        joinRequestGroupId,
        rejectRequesterId,
        'integration rejection'
      );
      expect(result).toBeTruthy();
    }, 20_000);

    it('should keep the rejected requester out of the member set and clear pending count', async () => {
      const state = await confirmDirect(async () => {
        const [isMember, stats] = await Promise.all([
          os.groups.isMember(joinRequestGroupId, rejectRequesterId),
          os.groups.getStats(joinRequestGroupId),
        ]);

        return !isMember && Number(stats?.total_join_requests ?? 0) === 0
          ? { isMember, stats }
          : null;
      }, 'rejected join request');

      if (!state?.stats) throw new Error('rejected join request stats missing');
      expect(state?.isMember).toBe(false);
      expect(Number(state.stats.total_join_requests ?? 0)).toBe(0);
    }, 25_000);

    it('should let a third requester submit a join request for cancellation', async () => {
      const result = await cancelRequesterOs.groups.join(joinRequestGroupId);
      expect(result).toBeTruthy();
    }, 20_000);

    it('should expose the cancellable join request before cancellation', async () => {
      const request = await confirmDirect(async () => {
        const value = await os.groups.getJoinRequest(
          joinRequestGroupId,
          cancelRequesterId
        );
        return value?.status === 'pending' ? value : null;
      }, 'cancellable join request');

      expect(request?.requester_id).toBe(cancelRequesterId);
      expect(request?.status).toBe('pending');
    }, 25_000);

    it('should let the requester cancel their own join request', async () => {
      const result =
        await cancelRequesterOs.groups.cancelJoin(joinRequestGroupId);
      expect(result).toBeTruthy();
    }, 20_000);

    it('should keep the cancelled requester out of the member set', async () => {
      const state = await confirmDirect(async () => {
        const isMember = await os.groups.isMember(
          joinRequestGroupId,
          cancelRequesterId
        );
        return isMember ? null : { isMember };
      }, 'cancelled join request membership');

      expect(state?.isMember).toBe(false);
    }, 25_000);

    it('should write group content via groups.post', async () => {
      const result = await os.groups.post(
        joinRequestGroupId,
        { text: `Group post ${groupPostId}` },
        groupPostId
      );

      expect(result.txHash).toBeTruthy();
    }, 20_000);

    it('should expose the fresh group post across indexed read surfaces', async () => {
      const path = `${ACCOUNT_ID}/groups/${joinRequestGroupId}/content/post/${groupPostId}`;

      const indexed = await confirmIndexed(
        async () => {
          const value = await os.query.graphql<{
            postsCurrent: Array<{
              accountId: string;
              postId: string;
              groupId: string;
              isGroupContent: boolean;
              value: string;
            }>;
            dataUpdates: Array<{
              accountId: string;
              dataType: string;
              dataId: string;
              path: string;
              groupId: string;
              isGroupContent: boolean;
              operation: string;
              value: string;
            }>;
            groupUpdates: Array<{
              groupId: string;
              path: string;
              operation: string;
              value: string;
            }>;
          }>({
            query: `query GroupPostIndexed($accountId: String!, $groupId: String!, $postId: String!, $path: String!) {
              postsCurrent(
                where: {
                  accountId: {_eq: $accountId},
                  groupId: {_eq: $groupId},
                  postId: {_eq: $postId}
                },
                limit: 1,
                orderBy: [{blockHeight: DESC}]
              ) {
                accountId
                postId
                groupId
                isGroupContent
                value
              }
              dataUpdates(
                where: {path: {_eq: $path}},
                limit: 1,
                orderBy: [{blockHeight: DESC}]
              ) {
                accountId
                dataType
                dataId
                path
                groupId
                isGroupContent
                operation
                value
              }
              groupUpdates(
                where: {
                  groupId: {_eq: $groupId},
                  path: {_eq: $path},
                  operation: {_eq: "create"}
                },
                limit: 1,
                orderBy: [{blockHeight: DESC}]
              ) {
                groupId
                path
                operation
                value
              }
            }`,
            variables: {
              accountId: ACCOUNT_ID,
              groupId: joinRequestGroupId,
              postId: groupPostId,
              path,
            },
          });

          const post = value.data?.postsCurrent?.[0] ?? null;
          const data = value.data?.dataUpdates?.[0] ?? null;
          const group = value.data?.groupUpdates?.[0] ?? null;

          return post && data && group ? { post, data, group } : null;
        },
        'fresh group post indexed surfaces',
        { timeoutMs: 60_000, intervalMs: 5_000 }
      );

      expect(indexed.post.accountId).toBe(ACCOUNT_ID);
      expect(indexed.post.groupId).toBe(joinRequestGroupId);
      expect(indexed.post.postId).toBe(groupPostId);
      expect(indexed.post.isGroupContent).toBe(true);
      expect(indexed.post.value).toContain(`Group post ${groupPostId}`);

      expect(indexed.data.accountId).toBe(ACCOUNT_ID);
      expect(indexed.data.dataType).toBe('post');
      expect(indexed.data.dataId).toBe(groupPostId);
      expect(indexed.data.groupId).toBe(joinRequestGroupId);
      expect(indexed.data.path).toBe(path);
      expect(indexed.data.isGroupContent).toBe(true);
      expect(indexed.data.operation).toBe('set');
      expect(indexed.data.value).toContain(`Group post ${groupPostId}`);

      expect(indexed.group.groupId).toBe(joinRequestGroupId);
      expect(indexed.group.path).toBe(path);
      expect(indexed.group.operation).toBe('create');
      expect(indexed.group.value).toContain(`Group post ${groupPostId}`);
    }, 70_000);

    it('should return the fresh group post via getGroupFeed', async () => {
      const feed = await confirmIndexed(
        async () => {
          const value = await os.query.groups.feed({
            groupId: joinRequestGroupId,
            limit: 10,
          });
          return value.items.some((item) => item.postId === groupPostId)
            ? value
            : null;
        },
        'group feed',
        { timeoutMs: 60_000, intervalMs: 5_000 }
      );

      const post = feed.items.find((item) => item.postId === groupPostId);
      expect(post?.accountId).toBe(ACCOUNT_ID);
      expect(post?.groupId).toBe(joinRequestGroupId);
      expect(post?.isGroupContent).toBe(true);
      expect(post?.value).toContain(`Group post ${groupPostId}`);
    }, 70_000);

    it('should write a reply to the fresh group post via groups.post', async () => {
      const parentPath = `${ACCOUNT_ID}/groups/${joinRequestGroupId}/content/post/${groupPostId}`;
      const result = await os.groups.post(
        joinRequestGroupId,
        {
          text: `Group reply ${groupReplyId}`,
          parent: parentPath,
          parentType: 'post',
        },
        groupReplyId
      );

      expect(result.txHash).toBeTruthy();
    }, 20_000);

    it('should expose replies to the fresh group post via getRepliesByPath', async () => {
      const parentPath = `${ACCOUNT_ID}/groups/${joinRequestGroupId}/content/post/${groupPostId}`;
      const replies = await confirmIndexed(
        async () => {
          const value = await os.query.threads.repliesByPath(parentPath, {
            limit: 20,
          });
          return value.some((item) => item.postId === groupReplyId)
            ? value
            : null;
        },
        'group replies by path',
        { timeoutMs: 60_000, intervalMs: 5_000 }
      );

      const reply = replies.find((item) => item.postId === groupReplyId);
      expect(reply?.accountId).toBe(ACCOUNT_ID);
      expect(reply?.groupId).toBe(joinRequestGroupId);
      expect(reply?.parentAuthor).toBe(ACCOUNT_ID);
      expect(reply?.parentPath).toBe(parentPath);
      expect(reply?.value).toContain(`Group reply ${groupReplyId}`);
    }, 70_000);

    it('should write a quote of the fresh group post via groups.quote', async () => {
      const refPath = `${ACCOUNT_ID}/groups/${joinRequestGroupId}/content/post/${groupPostId}`;
      const result = await os.groups.quote(
        joinRequestGroupId,
        refPath,
        { text: `Group quote ${groupQuoteId}` },
        groupQuoteId
      );

      expect(result.txHash).toBeTruthy();
    }, 20_000);

    it('should expose quotes of the fresh group post via getQuotesByPath', async () => {
      const refPath = `${ACCOUNT_ID}/groups/${joinRequestGroupId}/content/post/${groupPostId}`;
      const quotes = await confirmIndexed(
        async () => {
          const value = await os.query.threads.quotesByPath(refPath, { limit: 20 });
          return value.some((item) => item.postId === groupQuoteId)
            ? value
            : null;
        },
        'group quotes by path',
        { timeoutMs: 60_000, intervalMs: 5_000 }
      );

      const quote = quotes.find((item) => item.postId === groupQuoteId);
      expect(quote?.accountId).toBe(ACCOUNT_ID);
      expect(quote?.groupId).toBe(joinRequestGroupId);
      expect(quote?.refAuthor).toBe(ACCOUNT_ID);
      expect(quote?.refPath).toBe(refPath);
      expect(quote?.value).toContain(`Group quote ${groupQuoteId}`);
    }, 70_000);

    it('should transfer group ownership to the approved requester', async () => {
      const result = await os.groups.transferOwnership(
        joinRequestGroupId,
        requesterId
      );
      expect(result).toBeTruthy();
    }, 20_000);

    it('should expose the approved requester as the new owner', async () => {
      const state = await confirmDirect(async () => {
        const [newOwner, oldOwner] = await Promise.all([
          os.groups.isOwner(joinRequestGroupId, requesterId),
          os.groups.isOwner(joinRequestGroupId, ACCOUNT_ID),
        ]);

        return newOwner && !oldOwner ? { newOwner, oldOwner } : null;
      }, 'transferred group ownership');

      expect(state?.newOwner).toBe(true);
      expect(state?.oldOwner).toBe(false);
    }, 25_000);
  });
});
