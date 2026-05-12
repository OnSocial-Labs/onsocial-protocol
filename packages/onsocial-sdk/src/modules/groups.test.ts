import { describe, expect, it, vi } from 'vitest';
import { GroupsModule } from './groups.js';
import { groupConfigV1 } from '../schema/v1.js';

// ---------------------------------------------------------------------------
// Test harness
// ---------------------------------------------------------------------------
//
// All write methods in GroupsModule now go through the session-bridge:
//   - direct actions (create/join/vote/...) use signAndRelay() which calls
//     session.signComposeDelegate(...) then POST /relay/delegate
//   - compose verbs (group post/reply/quote) use composeAndSign() which
//     POSTs /compose/prepare/<verb> first, then signs the returned action
//     via session.signComposeDelegate(...), then POST /relay/delegate
//
// We assert against the **signed action** and **target account** captured by
// the session.signComposeDelegate() spy — that's the contract-facing shape
// that matters. Transport details (which endpoint, in what order) are covered
// by session-bridge.test.ts.
// ---------------------------------------------------------------------------

interface HarnessOpts {
  network?: 'mainnet' | 'testnet';
  /** What the gateway returns from /compose/prepare/<verb>. */
  prepareResponse?: { action: Record<string, unknown>; target_account: string };
}

function makeHarness(opts: HarnessOpts = {}) {
  const network = opts.network ?? 'mainnet';
  const signed: Array<{
    action: Record<string, unknown>;
    targetAccount: string;
  }> = [];

  const post = vi.fn(async (path: string) => {
    if (path.startsWith('/compose/prepare/')) {
      return (
        opts.prepareResponse ?? {
          action: { type: 'prepared_stub' },
          target_account:
            network === 'mainnet'
              ? 'core.onsocial.near'
              : 'core.onsocial.testnet',
        }
      );
    }
    if (path === '/relay/delegate') return { txHash: 'tx_signed' };
    throw new Error(`unexpected POST ${path}`);
  });
  const get = vi.fn(async (path: string): Promise<unknown> => {
    if (path === '/relay/latest-block') return { block_height: 100 };
    throw new Error(`unexpected GET ${path}`);
  });

  const session = {
    signComposeDelegate: vi.fn(
      async (args: {
        action: Record<string, unknown>;
        targetContract: string;
      }) => {
        signed.push({
          action: args.action,
          targetAccount: args.targetContract,
        });
        return { base64: 'BASE64_DELEGATE_BLOB', nonce: 1 };
      }
    ),
  };

  const http = { post, get, network } as never;
  const groups = new GroupsModule(http, () => session as never);
  return { groups, post, get, signed };
}

const CORE_MAINNET = 'core.onsocial.near';

describe('GroupsModule lifecycle (signed actions)', () => {
  it('signs create_group with provided config', async () => {
    const { groups, signed } = makeHarness();
    const config = groupConfigV1({
      name: 'Builders',
      description: 'Core contributors',
      isPrivate: false,
      memberDriven: true,
      tags: ['builders', 'core'],
    });

    await groups.create('dao', config);

    expect(signed).toEqual([
      {
        action: {
          type: 'create_group',
          group_id: 'dao',
          config: {
            v: 1,
            name: 'Builders',
            description: 'Core contributors',
            is_private: false,
            member_driven: true,
            tags: ['builders', 'core'],
          },
        },
        targetAccount: CORE_MAINNET,
      },
    ]);
  });

  it('signs add_group_member with group and member ids', async () => {
    const { groups, signed } = makeHarness();
    await groups.addMember('dao', 'bob.near');
    expect(signed[0]).toEqual({
      action: {
        type: 'add_group_member',
        group_id: 'dao',
        member_id: 'bob.near',
      },
      targetAccount: CORE_MAINNET,
    });
  });
});

describe('GroupsModule view reads', () => {
  it('encodes group and member ids when reading membership state', async () => {
    const { groups, get } = makeHarness();
    get.mockResolvedValue(true);

    const result = await groups.isMember('dao/core', 'bob+mod.near');
    expect(result).toBe(true);
    expect(get).toHaveBeenCalledWith(
      '/data/group-is-member?groupId=dao%2Fcore&memberId=bob%2Bmod.near'
    );
  });
});

describe('GroupsModule governance proposals (signed actions)', () => {
  it('builds invite-member proposals with optional message', async () => {
    const { groups, signed } = makeHarness();
    await groups.proposeInviteMember('dao', 'eve.near', {
      message: 'Would strengthen the moderation bench',
      autoVote: true,
    });
    expect(signed[0].action).toEqual({
      type: 'create_proposal',
      group_id: 'dao',
      proposal_type: 'member_invite',
      changes: {
        target_user: 'eve.near',
        message: 'Would strengthen the moderation bench',
      },
      auto_vote: true,
    });
  });

  it('builds remove-member proposals as group_update changes', async () => {
    const { groups, signed } = makeHarness();
    await groups.proposeRemoveMember('dao', 'bob.near', {
      reason: 'Inactive for six months',
      description: 'Trim inactive members',
    });
    expect(signed[0].action).toEqual({
      type: 'create_proposal',
      group_id: 'dao',
      proposal_type: 'group_update',
      changes: {
        update_type: 'remove_member',
        target_user: 'bob.near',
        reason: 'Inactive for six months',
      },
      description: 'Trim inactive members',
    });
  });

  it('builds transfer-ownership proposals with remove_old_owner override', async () => {
    const { groups, signed } = makeHarness();
    await groups.proposeTransferOwnership('dao', 'carol.near', {
      removeOldOwner: false,
      reason: 'Rotate ownership to the elected lead',
      autoVote: true,
    });
    expect(signed[0].action).toEqual({
      type: 'create_proposal',
      group_id: 'dao',
      proposal_type: 'group_update',
      changes: {
        update_type: 'transfer_ownership',
        new_owner: 'carol.near',
        remove_old_owner: false,
        reason: 'Rotate ownership to the elected lead',
      },
      auto_vote: true,
    });
  });

  it('builds custom proposals with normalized custom_data payload', async () => {
    const { groups, signed } = makeHarness();
    await groups.proposeCustom(
      'dao',
      {
        title: 'Fund indexer migration',
        description: 'Approve budget for the next migration window',
        customData: { budgetNear: '250', owner: 'ops.near' },
      },
      { description: 'Treasury decision' }
    );
    expect(signed[0].action).toEqual({
      type: 'create_proposal',
      group_id: 'dao',
      proposal_type: 'custom_proposal',
      changes: {
        title: 'Fund indexer migration',
        description: 'Approve budget for the next migration window',
        custom_data: { budgetNear: '250', owner: 'ops.near' },
      },
      description: 'Treasury decision',
    });
  });

  it('builds ban proposals as group_update changes with reason', async () => {
    const { groups, signed } = makeHarness();
    await groups.proposeBan('dao', 'mallory.near', {
      reason: 'Repeated abuse',
    });
    expect(signed[0].action).toEqual({
      type: 'create_proposal',
      group_id: 'dao',
      proposal_type: 'group_update',
      changes: {
        update_type: 'ban',
        target_user: 'mallory.near',
        reason: 'Repeated abuse',
      },
    });
  });

  it('builds unban proposals as group_update changes', async () => {
    const { groups, signed } = makeHarness();
    await groups.proposeUnban('dao', 'mallory.near');
    expect(signed[0].action).toEqual({
      type: 'create_proposal',
      group_id: 'dao',
      proposal_type: 'group_update',
      changes: { update_type: 'unban', target_user: 'mallory.near' },
    });
  });

  it('builds metadata-update proposals carrying the metadata payload', async () => {
    const { groups, signed } = makeHarness();
    await groups.proposeMetadataUpdate(
      'dao',
      { name: 'Builders DAO', description: 'New tagline' },
      { reason: 'Rebrand', autoVote: true }
    );
    expect(signed[0].action).toEqual({
      type: 'create_proposal',
      group_id: 'dao',
      proposal_type: 'group_update',
      changes: {
        update_type: 'metadata',
        metadata: { name: 'Builders DAO', description: 'New tagline' },
        reason: 'Rebrand',
      },
      auto_vote: true,
    });
  });

  it('builds voting-config-change proposals with snake_case keys + stringified period', async () => {
    const { groups, signed } = makeHarness();
    await groups.proposeVotingConfigChange(
      'dao',
      {
        participationQuorumBps: 7500,
        majorityThresholdBps: 6000,
        votingPeriod: 604800000000000,
      },
      { reason: 'Tighten consensus' }
    );
    expect(signed[0].action).toEqual({
      type: 'create_proposal',
      group_id: 'dao',
      proposal_type: 'voting_config_change',
      changes: {
        participation_quorum_bps: 7500,
        majority_threshold_bps: 6000,
        voting_period: '604800000000000',
        reason: 'Tighten consensus',
      },
    });
  });

  it('voting-config-change omits unspecified fields', async () => {
    const { groups, signed } = makeHarness();
    await groups.proposeVotingConfigChange('dao', {
      participationQuorumBps: 5000,
    });
    expect(signed[0].action).toEqual({
      type: 'create_proposal',
      group_id: 'dao',
      proposal_type: 'voting_config_change',
      changes: { participation_quorum_bps: 5000 },
    });
  });

  it('builds permission-change proposals with optional reason', async () => {
    const { groups, signed } = makeHarness();
    await groups.proposePermissionChange('dao', {
      targetUser: 'bob.near',
      level: 2,
      reason: 'Promote to moderator',
    });
    expect(signed[0].action).toEqual({
      type: 'create_proposal',
      group_id: 'dao',
      proposal_type: 'permission_change',
      changes: {
        target_user: 'bob.near',
        level: 2,
        reason: 'Promote to moderator',
      },
    });
  });

  it('permission-change omits reason when not provided', async () => {
    const { groups, signed } = makeHarness();
    await groups.proposePermissionChange('dao', {
      targetUser: 'bob.near',
      level: 0,
    });
    expect(signed[0].action).toEqual({
      type: 'create_proposal',
      group_id: 'dao',
      proposal_type: 'permission_change',
      changes: { target_user: 'bob.near', level: 0 },
    });
  });

  it('builds join-request proposals with optional message', async () => {
    const { groups, signed } = makeHarness();
    await groups.proposeJoinRequest('dao', 'alice.near', {
      message: 'I want in',
    });
    expect(signed[0].action).toEqual({
      type: 'create_proposal',
      group_id: 'dao',
      proposal_type: 'join_request',
      changes: { requester: 'alice.near', message: 'I want in' },
    });
  });

  it('join-request omits message when not provided', async () => {
    const { groups, signed } = makeHarness();
    await groups.proposeJoinRequest('dao', 'alice.near');
    expect(signed[0].action).toEqual({
      type: 'create_proposal',
      group_id: 'dao',
      proposal_type: 'join_request',
      changes: { requester: 'alice.near' },
    });
  });
});

describe('GroupsModule group content (compose/prepare → sign → relay)', () => {
  it('sends group reply as compose/prepare/set body and signs the returned action', async () => {
    const preparedAction = {
      type: 'set',
      data: {
        'groups/dao/content/post/reply-1': '{"v":1,"text":"reply in group"}',
      },
    };
    const { groups, post, signed } = makeHarness({
      prepareResponse: {
        action: preparedAction,
        target_account: CORE_MAINNET,
      },
    });

    await groups.reply(
      'dao',
      'alice.near/groups/dao/content/post/root',
      { text: 'reply in group' },
      'reply-1'
    );

    // First HTTP call: /compose/prepare/set with the SDK-built body.
    const prepCall = post.mock.calls.find(
      (call) =>
        (call as unknown as [string, unknown])[0] === '/compose/prepare/set'
    ) as unknown as
      | [string, { path: string; value: string; targetAccount: string }]
      | undefined;
    expect(prepCall).toBeDefined();
    const body = prepCall![1];
    expect(body.path).toBe('groups/dao/content/post/reply-1');
    expect(body.targetAccount).toBe(CORE_MAINNET);
    expect(JSON.parse(body.value)).toMatchObject({
      v: 1,
      text: 'reply in group',
      parent: 'alice.near/groups/dao/content/post/root',
      parentType: 'post',
    });

    // Then session signs the gateway-returned action.
    expect(signed[0].action).toEqual(preparedAction);
    expect(signed[0].targetAccount).toBe(CORE_MAINNET);
  });

  it('sends group quote as compose/prepare/set body', async () => {
    const { groups, post, signed } = makeHarness();
    await groups.quote(
      'dao',
      'alice.near/groups/dao/content/post/root',
      { text: 'quote in group' },
      'quote-1'
    );

    const prepCall = post.mock.calls.find(
      (call) =>
        (call as unknown as [string, unknown])[0] === '/compose/prepare/set'
    ) as unknown as
      | [string, { path: string; value: string; targetAccount: string }]
      | undefined;
    const body = prepCall![1];
    expect(body.path).toBe('groups/dao/content/post/quote-1');
    expect(body.targetAccount).toBe(CORE_MAINNET);
    expect(JSON.parse(body.value)).toMatchObject({
      v: 1,
      text: 'quote in group',
      ref: 'alice.near/groups/dao/content/post/root',
      refAuthor: 'alice.near',
      refType: 'quote',
    });
    expect(signed.length).toBe(1);
  });

  it('replyToPost resolves typed parent ref to the raw path', async () => {
    const { groups, post } = makeHarness();
    await groups.replyToPost(
      'dao',
      { author: 'alice.near', groupId: 'dao', postId: 'root' },
      { text: 'reply via ref' },
      'reply-ref-1'
    );
    const prepCall = post.mock.calls.find(
      (call) =>
        (call as unknown as [string, unknown])[0] === '/compose/prepare/set'
    ) as unknown as [string, { path: string; value: string }] | undefined;
    const body = prepCall![1];
    expect(body.path).toBe('groups/dao/content/post/reply-ref-1');
    expect(JSON.parse(body.value)).toMatchObject({
      parent: 'alice.near/groups/dao/content/post/root',
      parentType: 'post',
      text: 'reply via ref',
    });
  });

  it('quotePost resolves typed ref to the raw path', async () => {
    const { groups, post } = makeHarness();
    await groups.quotePost(
      'dao',
      { author: 'alice.near', groupId: 'dao', postId: 'root' },
      { text: 'quote via ref' },
      'quote-ref-1'
    );
    const prepCall = post.mock.calls.find(
      (call) =>
        (call as unknown as [string, unknown])[0] === '/compose/prepare/set'
    ) as unknown as [string, { path: string; value: string }] | undefined;
    const body = prepCall![1];
    expect(body.path).toBe('groups/dao/content/post/quote-ref-1');
    expect(JSON.parse(body.value)).toMatchObject({
      ref: 'alice.near/groups/dao/content/post/root',
      refAuthor: 'alice.near',
      refType: 'quote',
      text: 'quote via ref',
    });
  });
});

describe('GroupsModule session enforcement', () => {
  it('throws SessionRequiredError when no session is attached', async () => {
    const post = vi.fn();
    const http = { post, network: 'mainnet' } as never;
    const groups = new GroupsModule(http, () => null);

    await expect(groups.join('dao')).rejects.toMatchObject({
      code: 'SESSION_REQUIRED',
    });
    expect(post).not.toHaveBeenCalled();
  });
});
