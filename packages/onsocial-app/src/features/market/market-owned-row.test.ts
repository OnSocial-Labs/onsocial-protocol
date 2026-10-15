import { describe, expect, it } from 'vitest';
import {
  ownedListingClock,
  ownedListingStatusBit,
} from '@/features/market/market-owned-row';

const NOW = Date.parse('2026-06-15T12:00:00.000Z');

describe('owned listing clock', () => {
  it('puts Listed on a fixed listing and drops the repeated word', () => {
    const clock = ownedListingClock(
      {
        listingKind: 'fixed',
        listedAtMs: NOW - 4 * 86_400_000,
      },
      NOW
    );
    expect(clock?.label).toBe('Listed 4d');
    expect(
      ownedListingStatusBit({ listingKind: 'fixed', bidCount: 0 }, clock!.label)
    ).toBeNull();
  });

  it('keeps bid count and lets the corner say the auction ended', () => {
    const clock = ownedListingClock(
      {
        listingKind: 'auction',
        expiresAtNs: (NOW - 60_000) * 1_000_000,
      },
      NOW
    );
    expect(clock?.label).toBe('Ended');
    expect(
      ownedListingStatusBit(
        { listingKind: 'auction', bidCount: 2 },
        clock!.label
      )
    ).toBe('2 bids');
  });

  it('says Ready to sell when nothing is listed', () => {
    expect(
      ownedListingClock({ listingKind: null, listedAtMs: NOW }, NOW)
    ).toBeNull();
    expect(
      ownedListingStatusBit({ listingKind: null, bidCount: 0 }, null)
    ).toBe('Ready to sell');
  });
});
