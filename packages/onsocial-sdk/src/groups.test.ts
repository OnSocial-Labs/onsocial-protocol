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
});