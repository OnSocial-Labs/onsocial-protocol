// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import type { PostScarceEmbed } from '@onsocial/sdk';
import { useResetScarceEmbedOverrides } from '@/features/scarces/scarce-embed-account';
import {
  clearScarceEmbedLedger,
  getScarceEmbedOverride,
  getScarceEmbedSeed,
  seedScarceEmbedsFromSsr,
  setScarceEmbedOverride,
} from '@/features/scarces/scarce-embed-ledger';

const KEY = 'alice.near/post/1';

function embed(over: Partial<PostScarceEmbed>): PostScarceEmbed {
  return { status: 'none', events: [], ...over };
}

describe('useResetScarceEmbedOverrides', () => {
  beforeEach(() => {
    clearScarceEmbedLedger();
  });

  it('clears optimistic overrides on account switch and keeps seeds', () => {
    seedScarceEmbedsFromSsr({
      [KEY]: embed({
        status: 'lazy_listing',
        listingId: 'll:1',
        priceNear: '2',
      }),
    });
    setScarceEmbedOverride(
      KEY,
      embed({ status: 'lazy_listing', listingId: 'll:opt', priceNear: '1' })
    );

    const { rerender } = renderHook(
      ({ accountId }: { accountId: string | null }) =>
        useResetScarceEmbedOverrides(accountId),
      { initialProps: { accountId: 'alice.near' } }
    );

    expect(getScarceEmbedOverride(KEY)?.listingId).toBe('ll:opt');

    act(() => {
      rerender({ accountId: 'Alice.near' });
    });
    expect(getScarceEmbedOverride(KEY)?.listingId).toBe('ll:opt');

    act(() => {
      rerender({ accountId: 'bob.near' });
    });
    expect(getScarceEmbedOverride(KEY)).toBeNull();
    expect(getScarceEmbedSeed(KEY)?.listingId).toBe('ll:1');
    expect(getScarceEmbedSeed(KEY)?.priceNear).toBe('2');
  });

  it('clears overrides on logout', () => {
    setScarceEmbedOverride(KEY, embed({ status: 'sold' }));
    const { rerender } = renderHook(
      ({ accountId }: { accountId: string | null }) =>
        useResetScarceEmbedOverrides(accountId),
      { initialProps: { accountId: 'alice.near' as string | null } }
    );
    act(() => {
      rerender({ accountId: null });
    });
    expect(getScarceEmbedOverride(KEY)).toBeNull();
  });
});
