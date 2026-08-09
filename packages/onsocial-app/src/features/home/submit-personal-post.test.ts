import { describe, expect, it, vi } from 'vitest';
import {
  parsePostCollectionEmbed,
  parsePostPollEmbed,
} from '@/lib/post-display';
import { submitPersonalPost } from '@/features/home/submit-personal-post';
import type { OnSocial, PostRow } from '@onsocial/sdk';

vi.mock('@/features/home/assert-can-reply-to-guild-post', () => ({
  assertCanReplyToGuildPost: vi.fn().mockResolvedValue(undefined),
}));

function mockClient(overrides: {
  create?: ReturnType<typeof vi.fn>;
  reply?: ReturnType<typeof vi.fn>;
  quote?: ReturnType<typeof vi.fn>;
  replyToPost?: ReturnType<typeof vi.fn>;
  quotePost?: ReturnType<typeof vi.fn>;
}): OnSocial {
  return {
    posts: {
      create: overrides.create ?? vi.fn().mockResolvedValue({ txHash: 'tx1' }),
      reply: overrides.reply ?? vi.fn().mockResolvedValue({ txHash: 'tx1' }),
      quote: overrides.quote ?? vi.fn().mockResolvedValue({ txHash: 'tx1' }),
    },
    groups: {
      quotePost:
        overrides.quotePost ?? vi.fn().mockResolvedValue({ txHash: 'tx1' }),
      replyToPost:
        overrides.replyToPost ?? vi.fn().mockResolvedValue({ txHash: 'tx1' }),
    },
  } as unknown as OnSocial;
}

describe('submitPersonalPost', () => {
  it('creates a Drop reference post with collection embed + paint', async () => {
    const create = vi.fn().mockResolvedValue({ txHash: 'drop-tx' });
    const client = mockClient({ create });
    const trackTransaction = vi.fn().mockResolvedValue(true);

    const result = await submitPersonalPost({
      client,
      accountId: 'alice.testnet',
      mode: 'post',
      target: null,
      payload: {
        text: 'listen up',
        drop: {
          collectionId: 'drop-1',
          tokenId: 'drop-1:2',
          title: 'Night',
          mediaUrl: 'https://ipfs.io/ipfs/bafy',
          mediumKind: 'audio',
        },
      },
      trackTransaction,
    });

    expect(create).toHaveBeenCalledOnce();
    const [postData] = create.mock.calls[0]!;
    expect(postData.embeds?.[0]).toMatchObject({
      kind: 'collection',
      chain: 'near',
      collectionId: 'drop-1',
      tokenId: 'drop-1:2',
    });
    expect(postData.x?.onsocial?.drop).toMatchObject({
      collectionId: 'drop-1',
      title: 'Night',
      mediumKind: 'audio',
    });
    expect(result.optimisticPost?.kind).toBe('audio');
    const collection = parsePostCollectionEmbed(
      result.optimisticPost!.value
    );
    expect(collection?.collectionId).toBe('drop-1');
    expect(collection?.tokenId).toBe('drop-1:2');
  });

  it('creates a poll post with embed + optimistic kind', async () => {
    const create = vi.fn().mockResolvedValue({ txHash: 'poll-tx' });
    const client = mockClient({ create });
    const trackTransaction = vi.fn().mockResolvedValue(true);

    const result = await submitPersonalPost({
      client,
      accountId: 'alice.testnet',
      mode: 'post',
      target: null,
      payload: {
        text: 'Favorite color?',
        poll: { options: ['Red', 'Blue'], durationMs: 86_400_000 },
      },
      trackTransaction,
    });

    expect(create).toHaveBeenCalledOnce();
    const [postData] = create.mock.calls[0]!;
    expect(postData.embeds?.[0]).toMatchObject({
      kind: 'poll',
      question: 'Favorite color?',
      options: ['Red', 'Blue'],
    });
    expect(postData.embeds?.[0].closesAt).toEqual(expect.any(Number));

    expect(result.confirmed).toBe(true);
    expect(result.optimisticPost?.kind).toBe('poll');
    expect(result.optimisticPost?.isGroupContent).toBe(false);
    const poll = parsePostPollEmbed(result.optimisticPost!.value);
    expect(poll?.question).toBe('Favorite color?');
    expect(poll?.options).toEqual(['Red', 'Blue']);
  });

  it('replies on the personal path without guild checks', async () => {
    const reply = vi.fn().mockResolvedValue({ txHash: 'reply-tx' });
    const client = mockClient({ reply });
    const trackTransaction = vi.fn().mockResolvedValue(true);
    const target: PostRow = {
      accountId: 'bob.testnet',
      postId: '42',
      value: '{"v":1,"text":"hi"}',
      blockHeight: 1,
      blockTimestamp: 1,
      isGroupContent: false,
    };

    const result = await submitPersonalPost({
      client,
      accountId: 'alice.testnet',
      mode: 'reply',
      target,
      payload: { text: 'nice' },
      trackTransaction,
    });

    expect(reply).toHaveBeenCalledWith(
      { author: 'bob.testnet', postId: '42' },
      expect.objectContaining({ text: 'nice' }),
      expect.any(String)
    );
    expect(result.optimisticPost?.parentAuthor).toBe('bob.testnet');
    expect(result.optimisticPost?.parentPath).toBe('bob.testnet/post/42');
  });

  it('returns no optimistic row when chain confirm fails', async () => {
    const client = mockClient({});
    const trackTransaction = vi.fn().mockResolvedValue(false);

    const result = await submitPersonalPost({
      client,
      accountId: 'alice.testnet',
      mode: 'post',
      target: null,
      payload: { text: 'gm' },
      trackTransaction,
    });

    expect(result).toEqual({ confirmed: false, optimisticPost: null });
  });

  it('creates a media-only post with files + optimistic kind', async () => {
    const create = vi.fn().mockResolvedValue({ txHash: 'media-tx' });
    const client = mockClient({ create });
    const trackTransaction = vi.fn().mockResolvedValue(true);
    const imageFile = new File([new Uint8Array([1, 2, 3])], 'photo.png', {
      type: 'image/png',
    });

    const result = await submitPersonalPost({
      client,
      accountId: 'alice.testnet',
      mode: 'post',
      target: null,
      payload: { text: '', files: [imageFile] },
      trackTransaction,
    });

    expect(create).toHaveBeenCalledOnce();
    const [postData] = create.mock.calls[0]!;
    expect(postData.text).toBe('');
    expect(postData.files).toEqual([imageFile]);

    expect(result.confirmed).toBe(true);
    expect(result.optimisticPost?.kind).toBe('image');
    const body = JSON.parse(result.optimisticPost!.value) as {
      media?: Array<{ previewUrl?: string; mime?: string }>;
    };
    expect(body.media?.[0]?.mime).toBe('image/png');
    expect(body.media?.[0]?.previewUrl).toEqual(expect.any(String));
  });

  it('overrides inherited parent kind when replying with media', async () => {
    const reply = vi.fn().mockResolvedValue({ txHash: 'media-reply-tx' });
    const client = mockClient({ reply });
    const trackTransaction = vi.fn().mockResolvedValue(true);
    const videoFile = new File([new Uint8Array([1, 2, 3, 4])], 'clip.mp4', {
      type: 'video/mp4',
    });
    const target: PostRow = {
      accountId: 'bob.testnet',
      postId: '42',
      value: '{"v":1,"text":"hi"}',
      blockHeight: 1,
      blockTimestamp: 1,
      isGroupContent: false,
      kind: 'text',
    };

    const result = await submitPersonalPost({
      client,
      accountId: 'alice.testnet',
      mode: 'reply',
      target,
      payload: { text: 'clip', files: [videoFile] },
      trackTransaction,
    });

    expect(reply).toHaveBeenCalledWith(
      { author: 'bob.testnet', postId: '42' },
      expect.objectContaining({
        text: 'clip',
        files: [videoFile],
        kind: 'video',
      }),
      expect.any(String)
    );
    expect(result.optimisticPost?.kind).toBe('video');
  });

  it('extracts hashtags from body text into create payload', async () => {
    const create = vi.fn().mockResolvedValue({ txHash: 'tag-tx' });
    const client = mockClient({ create });
    const trackTransaction = vi.fn().mockResolvedValue(true);

    const result = await submitPersonalPost({
      client,
      accountId: 'alice.testnet',
      mode: 'post',
      target: null,
      payload: {
        text: '#NEAR is the chain.',
      },
      trackTransaction,
    });

    expect(create).toHaveBeenCalledOnce();
    const [postData] = create.mock.calls[0]!;
    expect(postData.hashtags).toEqual(['near']);
    expect(result.optimisticPost?.value).toContain('"hashtags":["near"]');
  });

  it('extracts $tickers from body text into create payload', async () => {
    const create = vi.fn().mockResolvedValue({ txHash: 'ticker-tx' });
    const client = mockClient({ create });
    const trackTransaction = vi.fn().mockResolvedValue(true);

    const result = await submitPersonalPost({
      client,
      accountId: 'alice.testnet',
      mode: 'post',
      target: null,
      payload: {
        text: 'Collecting $SOCIAL today.',
      },
      trackTransaction,
    });

    expect(create).toHaveBeenCalledOnce();
    const [postData] = create.mock.calls[0]!;
    expect(postData.tickers).toEqual(['social']);
    expect(result.optimisticPost?.value).toContain('"tickers":["social"]');
  });

  it('extracts @mentions from body text into create payload', async () => {
    const create = vi.fn().mockResolvedValue({ txHash: 'mention-tx' });
    const client = mockClient({ create });
    const trackTransaction = vi.fn().mockResolvedValue(true);

    const result = await submitPersonalPost({
      client,
      accountId: 'alice.testnet',
      mode: 'post',
      target: null,
      payload: {
        text: 'hey @Bob.Testnet check this',
      },
      trackTransaction,
    });

    expect(create).toHaveBeenCalledOnce();
    const [postData] = create.mock.calls[0]!;
    expect(postData.mentions).toEqual(['bob.testnet']);
    expect(result.optimisticPost?.value).toContain(
      '"mentions":["bob.testnet"]'
    );
  });

  it('persists contentWarning + nsfw on create and optimistic post', async () => {
    const create = vi.fn().mockResolvedValue({ txHash: 'nsfw-tx' });
    const client = mockClient({ create });
    const trackTransaction = vi.fn().mockResolvedValue(true);

    const result = await submitPersonalPost({
      client,
      accountId: 'alice.testnet',
      mode: 'post',
      target: null,
      payload: {
        text: 'behind the curtain',
        contentWarning: 'Spoilers',
        nsfw: true,
      },
      trackTransaction,
    });

    expect(create).toHaveBeenCalledOnce();
    const [postData] = create.mock.calls[0]!;
    expect(postData.contentWarning).toBe('Spoilers');
    expect(postData.nsfw).toBe(true);
    expect(result.optimisticPost?.value).toContain('"contentWarning":"Spoilers"');
    expect(result.optimisticPost?.value).toContain('"nsfw":true');
  });

  it('persists labels on personal reply and quote', async () => {
    const reply = vi.fn().mockResolvedValue({ txHash: 'reply-label-tx' });
    const quote = vi.fn().mockResolvedValue({ txHash: 'quote-label-tx' });
    const client = mockClient({ reply, quote });
    const trackTransaction = vi.fn().mockResolvedValue(true);
    const target: PostRow = {
      accountId: 'bob.testnet',
      postId: '42',
      value: '{"v":1,"text":"hi"}',
      blockHeight: 1,
      blockTimestamp: 1,
      isGroupContent: false,
    };

    const replyResult = await submitPersonalPost({
      client,
      accountId: 'alice.testnet',
      mode: 'reply',
      target,
      payload: {
        text: 'reply with warning',
        contentWarning: 'Spoilers',
      },
      trackTransaction,
    });
    expect(reply).toHaveBeenCalledOnce();
    expect(reply.mock.calls[0]![1]).toMatchObject({
      text: 'reply with warning',
      contentWarning: 'Spoilers',
    });
    expect(replyResult.optimisticPost?.value).toContain(
      '"contentWarning":"Spoilers"'
    );

    const quoteResult = await submitPersonalPost({
      client,
      accountId: 'alice.testnet',
      mode: 'quote',
      target,
      payload: {
        text: 'quote nsfw',
        nsfw: true,
      },
      trackTransaction,
    });
    expect(quote).toHaveBeenCalledOnce();
    expect(quote.mock.calls[0]![1]).toMatchObject({
      text: 'quote nsfw',
      nsfw: true,
    });
    expect(quoteResult.optimisticPost?.value).toContain('"nsfw":true');
  });

  it('persists labels on guild reply path', async () => {
    const replyToPost = vi.fn().mockResolvedValue({ txHash: 'guild-reply-tx' });
    const client = mockClient({ replyToPost });
    const trackTransaction = vi.fn().mockResolvedValue(true);
    const target: PostRow = {
      accountId: 'bob.testnet',
      postId: '7',
      value: '{"v":1,"text":"guild"}',
      blockHeight: 1,
      blockTimestamp: 1,
      groupId: 'builders',
      isGroupContent: true,
    };

    const result = await submitPersonalPost({
      client,
      accountId: 'alice.testnet',
      mode: 'reply',
      target,
      payload: {
        text: 'guild reply',
        contentWarning: 'Spoilers',
        nsfw: true,
      },
      trackTransaction,
    });

    expect(replyToPost).toHaveBeenCalledOnce();
    const [, , postData] = replyToPost.mock.calls[0]!;
    expect(postData).toMatchObject({
      text: 'guild reply',
      contentWarning: 'Spoilers',
      nsfw: true,
      groupId: 'builders',
    });
    expect(result.optimisticPost?.value).toContain('"contentWarning":"Spoilers"');
    expect(result.optimisticPost?.value).toContain('"nsfw":true');
  });
});
