import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ScarcesSubscribeApi } from './scarces.js';
import type { QueryModule } from '../../query/index.js';
import type { ScarcesEventRow } from '../../query/scarces.js';

function row(
  blockHeight: number,
  over: Partial<ScarcesEventRow> = {}
): ScarcesEventRow {
  return {
    eventType: 'TOKEN_OPERATION',
    operation: 'mint',
    author: 'alice.near',
    blockHeight,
    blockTimestamp: blockHeight * 1000,
    tokenId: null,
    collectionId: 'col-1',
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

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

function makeApi(pages: ScarcesEventRow[][]) {
  const eventsFn = vi.fn(async (_opts: unknown) => pages.shift() ?? []);
  const query = {
    scarces: { events: eventsFn },
  } as unknown as QueryModule;
  return { api: new ScarcesSubscribeApi(query), eventsFn };
}

describe('ScarcesSubscribeApi.byCollection', () => {
  it('emits initial backfill on first tick', async () => {
    const { api } = makeApi([[row(10), row(9)]]);
    const handler = vi.fn();
    const stop = api.byCollection('col-1', handler);
    // Let the seed promise resolve.
    await vi.advanceTimersByTimeAsync(0);
    expect(handler).toHaveBeenCalledTimes(1);
    const [rows, info] = handler.mock.calls[0];
    expect(rows.map((r: ScarcesEventRow) => r.blockHeight)).toEqual([10, 9]);
    expect(info.initial).toBe(true);
    expect(info.cursor).toBe(10);
    stop();
  });

  it('skips initial emission when emitInitial=false', async () => {
    const { api } = makeApi([[row(10)]]);
    const handler = vi.fn();
    const stop = api.byCollection('col-1', handler, { emitInitial: false });
    await vi.advanceTimersByTimeAsync(0);
    expect(handler).not.toHaveBeenCalled();
    stop();
  });

  it('only emits new rows on subsequent ticks (cursor advances)', async () => {
    const { api, eventsFn } = makeApi([
      [row(10)],
      [row(11), row(10)], // 10 already seen, 11 is new
      [row(11)], // nothing new
    ]);
    const handler = vi.fn();
    const stop = api.byCollection('col-1', handler, {
      intervalMs: 1000,
      emitInitial: false,
    });
    await vi.advanceTimersByTimeAsync(0);
    // Tick 1
    await vi.advanceTimersByTimeAsync(1000);
    expect(handler).toHaveBeenCalledTimes(1);
    expect(
      handler.mock.calls[0][0].map((r: ScarcesEventRow) => r.blockHeight)
    ).toEqual([11]);
    // Tick 2 — no new rows, no emission.
    await vi.advanceTimersByTimeAsync(1000);
    expect(handler).toHaveBeenCalledTimes(1);
    expect(eventsFn).toHaveBeenCalledTimes(3);
    stop();
  });

  it('passes collectionId to events()', async () => {
    const { api, eventsFn } = makeApi([[]]);
    const stop = api.byCollection('col-xyz', vi.fn(), { limit: 7 });
    await vi.advanceTimersByTimeAsync(0);
    expect(eventsFn).toHaveBeenCalledWith({
      collectionId: 'col-xyz',
      limit: 7,
    });
    stop();
  });

  it('stop() prevents further ticks', async () => {
    const { api, eventsFn } = makeApi([[], [], []]);
    const stop = api.byCollection('col-1', vi.fn(), { intervalMs: 500 });
    await vi.advanceTimersByTimeAsync(0);
    stop();
    await vi.advanceTimersByTimeAsync(2000);
    expect(eventsFn).toHaveBeenCalledTimes(1);
  });

  it('forwards errors to onError and keeps polling', async () => {
    const eventsFn = vi
      .fn()
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValue([]);
    const query = {
      scarces: { events: eventsFn },
    } as unknown as QueryModule;
    const api = new ScarcesSubscribeApi(query);
    const onError = vi.fn();
    const stop = api.byCollection('col-1', vi.fn(), {
      intervalMs: 100,
      onError,
    });
    await vi.advanceTimersByTimeAsync(0);
    expect(onError).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(100);
    expect(eventsFn).toHaveBeenCalledTimes(2);
    stop();
  });
});

describe('ScarcesSubscribeApi.byToken / byOwner / byAuthor', () => {
  it('byToken passes tokenId', async () => {
    const { api, eventsFn } = makeApi([[]]);
    const stop = api.byToken('s:1', vi.fn());
    await vi.advanceTimersByTimeAsync(0);
    expect(eventsFn).toHaveBeenCalledWith({ tokenId: 's:1', limit: 25 });
    stop();
  });

  it('byOwner passes ownerId', async () => {
    const { api, eventsFn } = makeApi([[]]);
    const stop = api.byOwner('alice.near', vi.fn());
    await vi.advanceTimersByTimeAsync(0);
    expect(eventsFn).toHaveBeenCalledWith({
      ownerId: 'alice.near',
      limit: 25,
    });
    stop();
  });

  it('byAuthor passes author', async () => {
    const { api, eventsFn } = makeApi([[]]);
    const stop = api.byAuthor('alice.near', vi.fn());
    await vi.advanceTimersByTimeAsync(0);
    expect(eventsFn).toHaveBeenCalledWith({
      author: 'alice.near',
      limit: 25,
    });
    stop();
  });
});
