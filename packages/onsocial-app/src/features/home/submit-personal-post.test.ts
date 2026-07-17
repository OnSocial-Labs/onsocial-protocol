import { describe, expect, it, vi } from 'vitest';
import { parsePostPollEmbed } from '@/lib/post-display';
import { submitPersonalPost } from '@/features/home/submit-personal-post';
import type { OnSocial, PostRow } from '@onsocial/sdk';

function mockClient(overrides: {
  create?: ReturnType<typeof vi.fn>;
  reply?: ReturnType<typeof vi.fn>;
  quote?: ReturnType<typeof vi.fn>;
}): OnSocial {
  return {
    posts: {
      create: overrides.create ?? vi.fn().mockResolvedValue({ txHash: 'tx1' }),
      reply: overrides.reply ?? vi.fn().mockResolvedValue({ txHash: 'tx1' }),
      quote: overrides.quote ?? vi.fn().mockResolvedValue({ txHash: 'tx1' }),
    },
    groups: {
      quotePost: vi.fn(),
      replyToPost: vi.fn(),
    },
  } as unknown as OnSocial;
}

describe('submitPersonalPost', () => {
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
});
