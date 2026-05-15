import { describe, expect, it, vi } from 'vitest';
import { ScarcesFromPostApi } from './from-post.js';
import type { ScarcesTokensApi } from './tokens.js';
import type { ScarcesLazyApi } from './lazy.js';
import type { QueryModule } from '../../query/index.js';
import type { ScarcesEventRow } from '../../query/scarces.js';

function row(over: Partial<ScarcesEventRow>): ScarcesEventRow {
  return {
    eventType: 'TOKEN_OPERATION',
    operation: 'mint',
    author: 'alice.near',
    blockHeight: 1,
    blockTimestamp: 1,
    tokenId: null,
    collectionId: null,
    listingId: null,
    ownerId: null,
    creatorId: null,
    buyerId: null,
    sellerId: null,
    bidder: null,
    accountId: null,
    appId: null,
    scarceContractId: null,
    amount: null,
    price: null,
    oldPrice: null,
    newPrice: null,
    bidAmount: null,
    marketplaceFee: null,
    appPoolAmount: null,
    creatorPayment: null,
    quantity: null,
    totalSupply: null,
    reservePrice: null,
    buyNowPrice: null,
    expiresAt: null,
    reason: null,
    memo: null,
    extraData: null,
    ...over,
  } as ScarcesEventRow;
}

function makeApi(
  events: ScarcesEventRow[],
  tokensById: Record<string, unknown> = {}
) {
  const eventsFn = vi.fn(async (_opts: unknown) => events);
  const query = {
    scarces: { events: eventsFn },
  } as unknown as QueryModule;
  const tokenGetFn = vi.fn(
    async (tokenId: string) => tokensById[tokenId] ?? null
  );
  const tokens = { get: tokenGetFn } as unknown as ScarcesTokensApi;
  const lazy = {} as ScarcesLazyApi;
  const api = new ScarcesFromPostApi(tokens, lazy, undefined, query);
  return { api, eventsFn, tokenGetFn };
}

const POST = { author: 'alice.near', postId: '42' };

describe('ScarcesFromPostApi.embed', () => {
  it("returns status 'none' when no scarces reference the post", async () => {
    const { api } = makeApi([]);
    const r = await api.embed(POST);
    expect(r.status).toBe('none');
    expect(r.events).toEqual([]);
  });

  it('matches by extra.sourcePost.path', async () => {
    const { api } = makeApi([
      row({
        operation: 'mint',
        tokenId: 's:1',
        extraData: JSON.stringify({
          sourcePost: { path: 'alice.near/post/42' },
        }),
      }),
    ]);
    const r = await api.embed(POST);
    expect(r.status).toBe('minted');
    expect(r.tokenId).toBe('s:1');
  });

  it('matches by sourcePost.author + sourcePost.postId fallback', async () => {
    const { api } = makeApi([
      row({
        operation: 'mint',
        tokenId: 's:1',
        extraData: JSON.stringify({
          sourcePost: { author: 'alice.near', postId: '42' },
        }),
      }),
    ]);
    const r = await api.embed(POST);
    expect(r.status).toBe('minted');
  });

  it("derives 'lazy_listing' from operation", async () => {
    const { api } = makeApi([
      row({
        eventType: 'LAZY_LISTING',
        operation: 'lazy_create',
        listingId: 'l:1',
        extraData: JSON.stringify({
          sourcePost: { path: 'alice.near/post/42' },
          priceNear: '5',
        }),
      }),
    ]);
    const r = await api.embed(POST);
    expect(r.status).toBe('lazy_listing');
    expect(r.listingId).toBe('l:1');
    expect(r.priceNear).toBe('5');
  });

  it("derives 'auction' from eventType", async () => {
    const { api } = makeApi([
      row({
        eventType: 'AUCTION_OPERATION',
        operation: 'create',
        extraData: JSON.stringify({
          sourcePost: { path: 'alice.near/post/42' },
        }),
      }),
    ]);
    expect((await api.embed(POST)).status).toBe('auction');
  });

  it('ignores rows whose extraData does not match the post', async () => {
    const { api } = makeApi([
      row({
        extraData: JSON.stringify({
          sourcePost: { path: 'bob.near/post/99' },
        }),
      }),
    ]);
    expect((await api.embed(POST)).status).toBe('none');
  });

  it('ignores rows with no extraData and rows with malformed JSON', async () => {
    const { api } = makeApi([
      row({ extraData: null }),
      row({ extraData: '{not json' }),
    ]);
    expect((await api.embed(POST)).status).toBe('none');
  });

  it('falls back to token metadata sourcePost when event extraData is compact', async () => {
    const { api, tokenGetFn } = makeApi(
      [
        row({
          operation: 'quick_mint',
          tokenId: 's:1',
          extraData: JSON.stringify({
            author: 'alice.near',
            operation: 'quick_mint',
            owner_id: 'alice.near',
            token_id: 's:1',
          }),
        }),
      ],
      {
        's:1': {
          token_id: 's:1',
          owner_id: 'alice.near',
          metadata: {
            extra: JSON.stringify({
              sourcePost: { path: 'alice.near/post/42' },
            }),
          },
        },
      }
    );

    const r = await api.embed(POST);

    expect(tokenGetFn).toHaveBeenCalledWith('s:1');
    expect(r.status).toBe('minted');
    expect(r.tokenId).toBe('s:1');
  });

  it('matches legacy os.mintPost metadata during token fallback', async () => {
    const { api } = makeApi(
      [row({ operation: 'quick_mint', tokenId: 's:1', extraData: null })],
      {
        's:1': {
          token_id: 's:1',
          owner_id: 'alice.near',
          metadata: {
            extra: JSON.stringify({
              postAuthor: 'alice.near',
              postId: '42',
              postPath: 'alice.near/post/42',
            }),
          },
        },
      }
    );

    expect((await api.embed(POST)).status).toBe('minted');
  });

  it('ignores compact events when token metadata points at another post', async () => {
    const { api } = makeApi(
      [row({ operation: 'quick_mint', tokenId: 's:1', extraData: null })],
      {
        's:1': {
          token_id: 's:1',
          owner_id: 'alice.near',
          metadata: {
            extra: JSON.stringify({
              sourcePost: { path: 'alice.near/post/99' },
            }),
          },
        },
      }
    );

    expect((await api.embed(POST)).status).toBe('none');
  });

  it('throws when no QueryModule is wired', async () => {
    const api = new ScarcesFromPostApi(
      {} as ScarcesTokensApi,
      {} as ScarcesLazyApi
    );
    await expect(api.embed(POST)).rejects.toThrow(/QueryModule/);
  });

  it('passes author scope to query.scarces.events', async () => {
    const { api, eventsFn } = makeApi([]);
    await api.embed(POST);
    expect(eventsFn).toHaveBeenCalledWith({
      author: 'alice.near',
      limit: 50,
    });
  });
});
