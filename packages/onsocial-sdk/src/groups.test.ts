import { describe, expect, it, vi } from 'vitest';
import { GroupsModule } from './groups.js';
import { groupConfigV1 } from './schema/v1.js';

describe('GroupsModule transport', () => {
  it('posts create_group to /relay/execute with the provided config', async () => {
    const post = vi.fn().mockResolvedValue({ txHash: 'tx-create' });
    const groups = new GroupsModule({ post, network: 'mainnet' } as never);
    const config = groupConfigV1({
      name: 'Builders',
      description: 'Core contributors',
      isPrivate: false,
      memberDriven: true,
      tags: ['builders', 'core'],
    });

    await groups.create('dao', config);

    expect(post).toHaveBeenCalledWith('/relay/execute', {
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
      target_account: 'core.onsocial.near',
    });
  });

  it('posts add_group_member to /relay/execute with group and member ids', async () => {
    const post = vi.fn().mockResolvedValue({ txHash: 'tx-add-member' });
    const groups = new GroupsModule({ post, network: 'mainnet' } as never);

    await groups.addMember('dao', 'bob.near');

    expect(post).toHaveBeenCalledWith('/relay/execute', {
      action: {
        type: 'add_group_member',
        group_id: 'dao',
        member_id: 'bob.near',
      },
      target_account: 'core.onsocial.near',
    });
  });

  it('encodes group and member ids when reading membership state', async () => {
    const get = vi.fn().mockResolvedValue(true);
    const groups = new GroupsModule({ get, network: 'mainnet' } as never);

    const result = await groups.isMember('dao/core', 'bob+mod.near');

    expect(result).toBe(true);
    expect(get).toHaveBeenCalledWith(
      '/data/group-is-member?groupId=dao%2Fcore&memberId=bob%2Bmod.near'
    );
  });

  it('builds invite-member proposals with optional message', async () => {
    const post = vi.fn().mockResolvedValue({ txHash: 'tx-invite' });
    const groups = new GroupsModule({ post, network: 'mainnet' } as never);

    await groups.proposeInviteMember('dao', 'eve.near', {
      message: 'Would strengthen the moderation bench',
      autoVote: true,
    });

    expect(post).toHaveBeenCalledWith('/relay/execute', {
      action: {
        type: 'create_proposal',
        group_id: 'dao',
        proposal_type: 'member_invite',
        changes: {
          target_user: 'eve.near',
          message: 'Would strengthen the moderation bench',
        },
        auto_vote: true,
      },
      target_account: 'core.onsocial.near',
    });
  });

  it('builds remove-member proposals as group_update changes', async () => {
    const post = vi.fn().mockResolvedValue({ txHash: 'tx-remove' });
    const groups = new GroupsModule({ post, network: 'mainnet' } as never);

    await groups.proposeRemoveMember('dao', 'bob.near', {
      reason: 'Inactive for six months',
      description: 'Trim inactive members',
    });

    expect(post).toHaveBeenCalledWith('/relay/execute', {
      action: {
        type: 'create_proposal',
        group_id: 'dao',
        proposal_type: 'group_update',
        changes: {
          update_type: 'remove_member',
          target_user: 'bob.near',
          reason: 'Inactive for six months',
        },
        description: 'Trim inactive members',
      },
      target_account: 'core.onsocial.near',
    });
  });

  it('builds transfer-ownership proposals with remove_old_owner override', async () => {
    const post = vi.fn().mockResolvedValue({ txHash: 'tx-transfer-proposal' });
    const groups = new GroupsModule({ post, network: 'mainnet' } as never);

    await groups.proposeTransferOwnership('dao', 'carol.near', {
      removeOldOwner: false,
      reason: 'Rotate ownership to the elected lead',
      autoVote: true,
    });

    expect(post).toHaveBeenCalledWith('/relay/execute', {
      action: {
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
      },
      target_account: 'core.onsocial.near',
    });
  });

  it('builds custom proposals with normalized custom_data payload', async () => {
    const post = vi.fn().mockResolvedValue({ txHash: 'tx-custom' });
    const groups = new GroupsModule({ post, network: 'mainnet' } as never);

    await groups.proposeCustom(
      'dao',
      {
        title: 'Fund indexer migration',
        description: 'Approve budget for the next migration window',
        customData: { budgetNear: '250', owner: 'ops.near' },
      },
      { description: 'Treasury decision' }
    );

    expect(post).toHaveBeenCalledWith('/relay/execute', {
      action: {
        type: 'create_proposal',
        group_id: 'dao',
        proposal_type: 'custom_proposal',
        changes: {
          title: 'Fund indexer migration',
          description: 'Approve budget for the next migration window',
          custom_data: { budgetNear: '250', owner: 'ops.near' },
        },
        description: 'Treasury decision',
      },
      target_account: 'core.onsocial.near',
    });
  });

  it('writes group replies to /compose/set with parent metadata', async () => {
    const post = vi.fn().mockResolvedValue({ txHash: 'tx-group-reply' });
    const groups = new GroupsModule({ post, network: 'mainnet' } as never);

    await groups.reply(
      'dao',
      'alice.near/groups/dao/content/post/root',
      { text: 'reply in group' },
      'reply-1'
    );

    expect(post).toHaveBeenCalledTimes(1);
    const [, request] = post.mock.calls[0];
    expect(request.path).toBe('groups/dao/content/post/reply-1');
    expect(request.targetAccount).toBe('core.onsocial.near');
    expect(JSON.parse(request.value)).toMatchObject({
      v: 1,
      text: 'reply in group',
      parent: 'alice.near/groups/dao/content/post/root',
      parentType: 'post',
    });
    expect(JSON.parse(request.value).timestamp).toEqual(expect.any(Number));
  });

  it('writes group quotes to /compose/set with ref metadata', async () => {
    const post = vi.fn().mockResolvedValue({ txHash: 'tx-group-quote' });
    const groups = new GroupsModule({ post, network: 'mainnet' } as never);

    await groups.quote(
      'dao',
      'alice.near/groups/dao/content/post/root',
      { text: 'quote in group' },
      'quote-1'
    );

    expect(post).toHaveBeenCalledTimes(1);
    const [, request] = post.mock.calls[0];
    expect(request.path).toBe('groups/dao/content/post/quote-1');
    expect(request.targetAccount).toBe('core.onsocial.near');
    expect(JSON.parse(request.value)).toMatchObject({
      v: 1,
      text: 'quote in group',
      ref: 'alice.near/groups/dao/content/post/root',
      refAuthor: 'alice.near',
      refType: 'quote',
    });
    expect(JSON.parse(request.value).timestamp).toEqual(expect.any(Number));
  });

  it('writes typed group-post replies without requiring a raw path', async () => {
    const post = vi.fn().mockResolvedValue({ txHash: 'tx-group-reply-ref' });
    const groups = new GroupsModule({ post, network: 'mainnet' } as never);

    await groups.replyToPost(
      'dao',
      { author: 'alice.near', groupId: 'dao', postId: 'root' },
      { text: 'reply via ref' },
      'reply-ref-1'
    );

    const [, request] = post.mock.calls[0];
    expect(request.path).toBe('groups/dao/content/post/reply-ref-1');
    expect(JSON.parse(request.value)).toMatchObject({
      parent: 'alice.near/groups/dao/content/post/root',
      parentType: 'post',
      text: 'reply via ref',
    });
  });

  it('writes typed group-post quotes without requiring a raw path', async () => {
    const post = vi.fn().mockResolvedValue({ txHash: 'tx-group-quote-ref' });
    const groups = new GroupsModule({ post, network: 'mainnet' } as never);

    await groups.quotePost(
      'dao',
      { author: 'alice.near', groupId: 'dao', postId: 'root' },
      { text: 'quote via ref' },
      'quote-ref-1'
    );

    const [, request] = post.mock.calls[0];
    expect(request.path).toBe('groups/dao/content/post/quote-ref-1');
    expect(JSON.parse(request.value)).toMatchObject({
      ref: 'alice.near/groups/dao/content/post/root',
      refAuthor: 'alice.near',
      refType: 'quote',
      text: 'quote via ref',
    });
  });
});
