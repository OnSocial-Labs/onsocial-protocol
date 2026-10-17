import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ownedAuthorAccountId,
  ownedListingClock,
  ownedListingStatusBit,
} from '@/features/market/market-owned-row';

const here = dirname(fileURLToPath(import.meta.url));

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

  it('names the drop creator, then the post author', () => {
    expect(
      ownedAuthorAccountId({
        creatorId: ' artist.near ',
        sourcePostPath: 'other.near/post/1',
      })
    ).toBe('artist.near');
    expect(
      ownedAuthorAccountId({ sourcePostPath: 'writer.near/post/9' })
    ).toBe('writer.near');
    expect(ownedAuthorAccountId({})).toBe('');
  });

  it('puts by, then the author, above the price line', () => {
    const source = readFileSync(join(here, 'market-owned-row.tsx'), 'utf8');
    const titleAt = source.indexOf('market-listing-title');
    const partyAt = source.indexOf('<DiscoveryPartyStack');
    const priceAt = source.indexOf('market-listing-meta--price');
    expect(titleAt).toBeGreaterThan(-1);
    expect(partyAt).toBeGreaterThan(titleAt);
    expect(priceAt).toBeGreaterThan(partyAt);
    expect(source).toContain('lead="by"');
    expect(source).toContain('drops-discovery-head-trail');
    expect(source).not.toContain('trigger="label"');
  });

  it('says Ready to sell when nothing is listed', () => {
    expect(
      ownedListingClock({ listingKind: null, listedAtMs: NOW }, NOW)
    ).toBeNull();
    expect(
      ownedListingClock(
        { listingKind: null, mintedAtMs: NOW - 4 * 86_400_000 },
        NOW
      )?.label
    ).toBe('4d');
    expect(
      ownedListingStatusBit({ listingKind: null, bidCount: 0 }, null)
    ).toBe('Ready to sell');
  });
});
