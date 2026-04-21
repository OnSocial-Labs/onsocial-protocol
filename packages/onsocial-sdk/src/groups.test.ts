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
});