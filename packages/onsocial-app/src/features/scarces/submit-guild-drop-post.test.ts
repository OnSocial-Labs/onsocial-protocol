import { describe, expect, it, vi } from 'vitest';
import type { OnSocial } from '@onsocial/sdk';
import type { GuildSpace } from '@/features/guilds/guild-structure';
import {
  submitGuildDropPost,
  submitGuildRootPost,
} from '@/features/scarces/submit-guild-drop-post';

vi.mock('@/features/home/assert-can-reply-to-guild-post', () => ({
  assertCanReplyToGuildPost: vi.fn().mockResolvedValue(undefined),
}));

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
});

describe('submitGuildRootPost thread', () => {
  it('publishes a guild text thread as one social.set', async () => {
    const socialSet = vi.fn().mockResolvedValue({ txHash: 'guild-thread-tx' });
    const post = vi.fn();
    const replyToPost = vi.fn();
    const client = {
      social: { set: socialSet },
      groups: { post, replyToPost },
    } as unknown as OnSocial;
    const trackTransaction = vi.fn().mockResolvedValue(true);

    const result = await submitGuildRootPost({
      client,
      accountId: 'alice.testnet',
      groupId: 'builders',
      space,
      payload: {
        text: 'one',
        thread: [{ text: 'two' }],
      },
      trackTransaction,
    });

    expect(post).not.toHaveBeenCalled();
    expect(replyToPost).not.toHaveBeenCalled();
    expect(socialSet).toHaveBeenCalledOnce();
    const [entries] = socialSet.mock.calls[0]!;
    expect(JSON.stringify(entries)).toContain('one');
    expect(JSON.stringify(entries)).toContain('two');
    expect(result.confirmed).toBe(true);
    expect(result.postedCount).toBe(2);
    expect(result.optimisticPost?.value).toContain('one');
    expect(result.optimisticPosts).toHaveLength(2);
    const finalToast = trackTransaction.mock.calls.at(-1)?.[0];
    expect(finalToast?.successMessage).toBe('Thread posted.');
    expect(finalToast?.actionLabel).toBe('View thread');
    expect(finalToast?.actionHref).toBeTruthy();
    expect(finalToast?.txHashes).toEqual(['guild-thread-tx']);
    expect(result.txHashes).toEqual(['guild-thread-tx']);
  });

  it('keeps the landed root when a later sequential beat fails', async () => {
    const post = vi.fn().mockResolvedValue({ txHash: 'guild-root-tx' });
    const replyToPost = vi.fn().mockRejectedValue(new Error('nope'));
    const socialSet = vi.fn();
    const client = {
      social: { set: socialSet },
      groups: { post, replyToPost },
    } as unknown as OnSocial;
    const trackTransaction = vi.fn().mockResolvedValue(true);

    const result = await submitGuildRootPost({
      client,
      accountId: 'alice.testnet',
      groupId: 'builders',
      space,
      payload: {
        text: 'one',
        thread: [
          {
            text: 'two',
            files: [new File(['x'], 'a.jpg', { type: 'image/jpeg' })],
          },
        ],
      },
      trackTransaction,
    });

    expect(socialSet).not.toHaveBeenCalled();
    expect(result.confirmed).toBe(false);
    expect(result.postedCount).toBe(1);
    expect(result.optimisticPost?.value).toContain('one');
    const lastToast = trackTransaction.mock.calls.at(-1)?.[0];
    expect(lastToast?.toastKind).toBe('error');
    expect(lastToast?.failureMessage).toBe('Posted 1 of 2.');
    expect(lastToast?.explorerHash).toBe('guild-root-tx');
  });
});
