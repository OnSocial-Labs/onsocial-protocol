import type { Network } from '../types.js';
import type { CoreAction } from './actions.js';
import {
  PERMISSION_LEVEL,
  buildAddGroupMemberAction,
  buildApproveJoinRequestAction,
  buildBlacklistGroupMemberAction,
  buildCancelJoinRequestAction,
  buildCancelProposalAction,
  buildExpireProposalAction,
  buildCreateGroupAction,
  buildCreateProposalAction,
  buildGroupPostAction,
  buildJoinGroupAction,
  buildLeaveGroupAction,
  buildPostAction,
  buildProfileAction,
  buildQuoteAction,
  buildReactionAction,
  buildRejectJoinRequestAction,
  buildRemoveGroupMemberAction,
  buildReplyAction,
  buildSetGroupPrivacyAction,
  buildSetKeyPermissionAction,
  buildSetPermissionAction,
  buildStandWithAction,
  buildTransferGroupOwnershipAction,
  buildUnblacklistGroupMemberAction,
  buildUnstandAction,
  buildVoteOnProposalAction,
  prepareCoreRequest,
} from './actions.js';

export interface CoreParityCase {
  name: string;
  action: CoreAction;
  expectedAction: CoreAction;
  targetAccount: string;
}

/**
 * Every Action variant declared by `contracts/core-onsocial/src/protocol/types.rs::Action`.
 * Adding a new variant on the contract side without adding a fixture case here
 * causes the coverage assertion in `core-parity.test.ts` to fail.
 */
export const ALL_CORE_ACTION_TYPES = [
  'set',
  'create_group',
  'join_group',
  'leave_group',
  'add_group_member',
  'remove_group_member',
  'approve_join_request',
  'reject_join_request',
  'cancel_join_request',
  'blacklist_group_member',
  'unblacklist_group_member',
  'transfer_group_ownership',
  'set_group_privacy',
  'create_proposal',
  'vote_on_proposal',
  'cancel_proposal',
  'expire_proposal',
  'set_permission',
  'set_key_permission',
] as const;

export function getCoreParityCases(
  network: Network = 'testnet'
): CoreParityCase[] {
  const cases: Array<{
    name: string;
    action: CoreAction;
    expectedAction: CoreAction;
  }> = [
    {
      name: 'profile write',
      action: buildProfileAction({ name: 'Alice', bio: 'Builder' }),
      expectedAction: {
        type: 'set',
        data: {
          'profile/v': '1',
          'profile/name': 'Alice',
          'profile/bio': 'Builder',
        },
      },
    },
    {
      name: 'post create',
      action: buildPostAction({ text: 'Hello OnSocial!' }, 'post-123', 42),
      expectedAction: {
        type: 'set',
        data: {
          'post/post-123': {
            v: 1,
            text: 'Hello OnSocial!',
            kind: 'text',
            timestamp: 42,
          },
        },
      },
    },
    {
      name: 'stand with user',
      action: buildStandWithAction('bob.near', 99),
      expectedAction: {
        type: 'set',
        data: {
          'standing/bob.near': { v: 1, since: 99 },
        },
      },
    },
    {
      name: 'remove standing',
      action: buildUnstandAction('bob.near'),
      expectedAction: {
        type: 'set',
        data: {
          'standing/bob.near': null,
        },
      },
    },
    {
      name: 'react to content',
      action: buildReactionAction('bob.near', 'post/123', { type: 'like' }),
      expectedAction: {
        type: 'set',
        data: {
          'reaction/bob.near/like/post/123': { v: 1, type: 'like' },
        },
      },
    },
    // ── Reply / quote / group post (indexed by substreams) ─────────────────
    {
      name: 'reply to post',
      action: buildReplyAction(
        'alice.near',
        'main',
        { text: 'great post' },
        'reply-1',
        7
      ),
      expectedAction: {
        type: 'set',
        data: {
          'post/reply-1': {
            v: 1,
            text: 'great post',
            kind: 'text',
            parent: 'alice.near/post/main',
            parentType: 'post',
            timestamp: 7,
          },
        },
      },
    },
    {
      name: 'quote post',
      action: buildQuoteAction(
        'alice.near',
        'post/main',
        { text: 'love this' },
        'quote-1',
        8
      ),
      expectedAction: {
        type: 'set',
        data: {
          'post/quote-1': {
            v: 1,
            text: 'love this',
            kind: 'text',
            ref: 'alice.near/post/main',
            refType: 'quote',
            timestamp: 8,
          },
        },
      },
    },
    {
      name: 'group post',
      action: buildGroupPostAction(
        'builders',
        { text: 'group hello' },
        'gp-1',
        9
      ),
      expectedAction: {
        type: 'set',
        data: {
          'groups/builders/content/post/gp-1': {
            v: 1,
            text: 'group hello',
            kind: 'text',
            timestamp: 9,
          },
        },
      },
    },
    // ── Group lifecycle ─────────────────────────────────────────────────────
    {
      name: 'create group',
      action: buildCreateGroupAction('builders', { is_private: false }),
      expectedAction: {
        type: 'create_group',
        group_id: 'builders',
        config: { is_private: false },
      },
    },
    {
      name: 'join group',
      action: buildJoinGroupAction('builders'),
      expectedAction: { type: 'join_group', group_id: 'builders' },
    },
    {
      name: 'leave group',
      action: buildLeaveGroupAction('builders'),
      expectedAction: { type: 'leave_group', group_id: 'builders' },
    },
    {
      name: 'add group member',
      action: buildAddGroupMemberAction('builders', 'bob.near'),
      expectedAction: {
        type: 'add_group_member',
        group_id: 'builders',
        member_id: 'bob.near',
      },
    },
    {
      name: 'remove group member',
      action: buildRemoveGroupMemberAction('builders', 'bob.near'),
      expectedAction: {
        type: 'remove_group_member',
        group_id: 'builders',
        member_id: 'bob.near',
      },
    },
    {
      name: 'approve join request',
      action: buildApproveJoinRequestAction('builders', 'bob.near'),
      expectedAction: {
        type: 'approve_join_request',
        group_id: 'builders',
        requester_id: 'bob.near',
      },
    },
    {
      name: 'reject join request with reason',
      action: buildRejectJoinRequestAction('builders', 'bob.near', 'no spots'),
      expectedAction: {
        type: 'reject_join_request',
        group_id: 'builders',
        requester_id: 'bob.near',
        reason: 'no spots',
      },
    },
    {
      name: 'cancel join request',
      action: buildCancelJoinRequestAction('builders'),
      expectedAction: { type: 'cancel_join_request', group_id: 'builders' },
    },
    {
      name: 'blacklist member',
      action: buildBlacklistGroupMemberAction('builders', 'bob.near'),
      expectedAction: {
        type: 'blacklist_group_member',
        group_id: 'builders',
        member_id: 'bob.near',
      },
    },
    {
      name: 'unblacklist member',
      action: buildUnblacklistGroupMemberAction('builders', 'bob.near'),
      expectedAction: {
        type: 'unblacklist_group_member',
        group_id: 'builders',
        member_id: 'bob.near',
      },
    },
    {
      name: 'transfer group ownership',
      action: buildTransferGroupOwnershipAction('builders', 'carol.near', true),
      expectedAction: {
        type: 'transfer_group_ownership',
        group_id: 'builders',
        new_owner: 'carol.near',
        remove_old_owner: true,
      },
    },
    {
      name: 'set group privacy',
      action: buildSetGroupPrivacyAction('builders', true),
      expectedAction: {
        type: 'set_group_privacy',
        group_id: 'builders',
        is_private: true,
      },
    },
    // ── Governance ─────────────────────────────────────────────────────────
    {
      name: 'create proposal',
      action: buildCreateProposalAction({
        groupId: 'builders',
        proposalType: 'config_change',
        changes: { is_private: true },
        autoVote: true,
        description: 'Lock down the group',
      }),
      expectedAction: {
        type: 'create_proposal',
        group_id: 'builders',
        proposal_type: 'config_change',
        changes: { is_private: true },
        auto_vote: true,
        description: 'Lock down the group',
      },
    },
    {
      name: 'vote on proposal',
      action: buildVoteOnProposalAction('builders', 'p-1', true),
      expectedAction: {
        type: 'vote_on_proposal',
        group_id: 'builders',
        proposal_id: 'p-1',
        approve: true,
      },
    },
    {
      name: 'cancel proposal',
      action: buildCancelProposalAction('builders', 'p-1'),
      expectedAction: {
        type: 'cancel_proposal',
        group_id: 'builders',
        proposal_id: 'p-1',
      },
    },
    {
      name: 'expire proposal',
      action: buildExpireProposalAction('builders', 'p-1'),
      expectedAction: {
        type: 'expire_proposal',
        group_id: 'builders',
        proposal_id: 'p-1',
      },
    },
    // ── Permissions ────────────────────────────────────────────────────────
    {
      name: 'set account permission',
      action: buildSetPermissionAction({
        grantee: 'bob.near',
        path: 'profile',
        level: PERMISSION_LEVEL.WRITE,
        expiresAtMs: 1700000000000,
      }),
      expectedAction: {
        type: 'set_permission',
        grantee: 'bob.near',
        path: 'profile',
        level: 2,
        expires_at: '1700000000000',
      },
    },
    {
      name: 'set key permission',
      action: buildSetKeyPermissionAction({
        publicKey: 'ed25519:11111111111111111111111111111111',
        path: 'profile',
        level: PERMISSION_LEVEL.WRITE,
        expiresAtMs: 1700000000000,
      }),
      expectedAction: {
        type: 'set_key_permission',
        public_key: 'ed25519:11111111111111111111111111111111',
        path: 'profile',
        level: 2,
        expires_at: '1700000000000',
      },
    },
  ];

  return cases.map(({ name, action, expectedAction }) => ({
    name,
    action,
    expectedAction,
    targetAccount: prepareCoreRequest(action, network).targetAccount,
  }));
}
