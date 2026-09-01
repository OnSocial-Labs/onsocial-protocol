import { describe, expect, it, vi } from 'vitest';
import type { OnSocial } from '@onsocial/sdk';
import type { GuildSpace } from '@/features/guilds/guild-structure';
import {
  submitGuildDropPost,
  submitGuildRootPost,
} from '@/features/scarces/submit-guild-drop-post';

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

  it('persists contentWarning + nsfw on guild Drop posts', async () => {
    const post = vi.fn().mockResolvedValue({ txHash: 'guild-nsfw-tx' });
    const client = {
      groups: { post },
    } as unknown as OnSocial;
    const trackTransaction = vi.fn().mockResolvedValue(true);

    const result = await submitGuildDropPost({
      client,
      accountId: 'alice.testnet',
      groupId: 'builders',
      space,
      text: 'listen carefully',
      drop: {
        collectionId: 'drop-1',
        title: 'Night',
        mediumKind: 'audio',
      },
      contentWarning: 'Spoilers',
      nsfw: true,
      trackTransaction,
    });

    expect(post).toHaveBeenCalledOnce();
    const [, postData] = post.mock.calls[0]!;
    expect(postData).toMatchObject({
      contentWarning: 'Spoilers',
      nsfw: true,
    });
    expect(result.optimisticPost?.value).toContain('"contentWarning":"Spoilers"');
    expect(result.optimisticPost?.value).toContain('"nsfw":true');
  });

  it('posts a proposal embed into the guild room', async () => {
    const post = vi.fn().mockResolvedValue({ txHash: 'guild-proposal-tx' });
    const client = {
      groups: { post },
    } as unknown as OnSocial;
    const trackTransaction = vi.fn().mockResolvedValue(true);

    const result = await submitGuildRootPost({
      client,
      accountId: 'alice.testnet',
      groupId: 'builders',
      space,
      payload: {
        text: 'please vote',
        proposal: {
          groupId: 'builders',
          proposalId: '12',
          title: 'Invite alice.near',
          kind: 'Role',
        },
      },
      trackTransaction,
    });

    expect(post).toHaveBeenCalledOnce();
    const [, postData] = post.mock.calls[0]!;
    expect(postData).toMatchObject({
      text: 'please vote',
      embeds: [
        {
          kind: 'proposal',
          groupId: 'builders',
          proposalId: '12',
        },
      ],
      x: {
        onsocial: {
          proposal: expect.objectContaining({
            title: 'Invite alice.near',
            kind: 'Role',
          }),
        },
      },
    });
    expect(result.confirmed).toBe(true);
    expect(result.optimisticPost?.value).toContain('"kind":"proposal"');
  });
});
