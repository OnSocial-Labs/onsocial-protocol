import { describe, expect, it, vi } from 'vitest';
import type { OnSocial } from '@onsocial/sdk';
import type { GuildSpace } from '@/features/guilds/guild-structure';
import { submitGuildDropPost } from '@/features/scarces/submit-guild-drop-post';

const space: GuildSpace = {
  id: 'general',
  title: 'General',
  kind: 'discussion',
  enabled: true,
  order: 0,
  audience: 'members',
  postPolicy: 'members',
};

describe('submitGuildDropPost', () => {
  it('posts a collection embed into the guild room', async () => {
    const post = vi.fn().mockResolvedValue({ txHash: 'guild-drop-tx' });
    const client = {
      groups: { post },
    } as unknown as OnSocial;
    const trackTransaction = vi.fn().mockResolvedValue(true);

    const result = await submitGuildDropPost({
      client,
      accountId: 'alice.testnet',
      groupId: 'builders',
      space,
      text: '',
      drop: {
        collectionId: 'drop-1',
        title: 'Night',
        mediumKind: 'audio',
        mediaUrl: 'https://ipfs.io/ipfs/bafy',
      },
      trackTransaction,
    });

    expect(post).toHaveBeenCalledOnce();
    const [, postData] = post.mock.calls[0]!;
    expect(postData).toMatchObject({
      text: 'Night',
      access: 'group',
      groupId: 'builders',
      kind: 'audio',
      embeds: [
        expect.objectContaining({
          kind: 'collection',
          collectionId: 'drop-1',
        }),
      ],
      x: {
        onsocial: {
          drop: expect.objectContaining({
            collectionId: 'drop-1',
            title: 'Night',
            mediumKind: 'audio',
          }),
        },
      },
    });
    expect(result.confirmed).toBe(true);
    expect(result.optimisticPost?.groupId).toBe('builders');
    expect(result.optimisticPost?.isGroupContent).toBe(true);
    expect(result.optimisticPost?.kind).toBe('audio');
  });
});
