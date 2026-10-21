import { describe, expect, it } from 'vitest';
import {
  expectedRemainingAfterMint,
  mintSupplyClosed,
  pollDropRemaining,
  pollLazyListing,
} from '@/features/scarces/mint-index-confirm';

function clock() {
  let t = 0;
  return {
    now: () => t,
    sleep: async (ms: number) => {
      t += ms;
    },
  };
}

describe('expectedRemainingAfterMint', () => {
  it('subtracts the minted quantity from the count on screen', () => {
    expect(expectedRemainingAfterMint(10, 2)).toBe(8);
    expect(expectedRemainingAfterMint(1, 1)).toBe(0);
    expect(expectedRemainingAfterMint(null, 1)).toBeNull();
  });
});

describe('pollDropRemaining', () => {
  it('rolls the indexed remaining when it matches the local take', async () => {
    const time = clock();
    let reads = 0;
    const confirm = await pollDropRemaining({
      beforeRemaining: 5,
      quantity: 1,
      readShell: async () => {
        reads += 1;
        return { remaining: reads < 2 ? 5 : 4, totalSupply: 20 };
      },
      timeoutMs: 2_000,
      intervalMs: 400,
      now: time.now,
      sleep: time.sleep,
    });
    expect(confirm.fromIndex).toBe(true);
    expect(confirm.remaining).toBe(4);
    expect(mintSupplyClosed(confirm)).toBe(false);
    expect(reads).toBe(2);
  });

  it('keeps the local remaining when the index stays on the old count', async () => {
    const time = clock();
    const confirm = await pollDropRemaining({
      beforeRemaining: 5,
      quantity: 1,
      readShell: async () => ({ remaining: 5, totalSupply: 20 }),
      timeoutMs: 800,
      intervalMs: 400,
      now: time.now,
      sleep: time.sleep,
    });
    expect(confirm.fromIndex).toBe(false);
    expect(confirm.remaining).toBe(4);
    expect(confirm.shell).toBeNull();
    expect(mintSupplyClosed(confirm)).toBe(false);
  });

  it('closes a drop when the local take finishes the supply', async () => {
    const time = clock();
    const confirm = await pollDropRemaining({
      beforeRemaining: 1,
      quantity: 1,
      readShell: async () => ({ remaining: 1 }),
      timeoutMs: 400,
      intervalMs: 400,
      now: time.now,
      sleep: time.sleep,
    });
    expect(confirm.remaining).toBe(0);
    expect(mintSupplyClosed(confirm)).toBe(true);
  });
});

describe('pollLazyListing', () => {
  it('treats a missing listing as the indexed zero when the last copy minted', async () => {
    const time = clock();
    const face = await pollLazyListing({
      beforeRemaining: 1,
      quantity: 1,
      readListing: async () => null,
      timeoutMs: 2_000,
      intervalMs: 400,
      now: time.now,
      sleep: time.sleep,
    });
    expect(face.fromIndex).toBe(true);
    expect(face.remaining).toBe(0);
    expect(face.listingId).toBeNull();
  });

  it('keeps the local remaining when the listing row stays stale', async () => {
    const time = clock();
    const face = await pollLazyListing({
      beforeRemaining: 4,
      quantity: 1,
      readListing: async () => ({
        listingId: 'lazy-1',
        remaining: 4,
        copies: 4,
        priceNear: '1',
      }),
      timeoutMs: 400,
      intervalMs: 400,
      now: time.now,
      sleep: time.sleep,
    });
    expect(face.fromIndex).toBe(false);
    expect(face.remaining).toBe(3);
  });
});
