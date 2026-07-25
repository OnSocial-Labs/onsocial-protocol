import { describe, expect, it } from 'vitest';
import {
  listingActionAgeLabel,
  listingActionEyebrow,
  listingActionOpensBidSheet,
  listingActionPendingLabel,
  listingActionPrimaryLabel,
  listingActionRowMeta,
  listingActionSectionTitle,
  listingActionTimeLabel,
  type ListingActionItem,
} from '@/features/scarces/listing-actions';

function base(
  overrides: Partial<ListingActionItem> & Pick<ListingActionItem, 'kind' | 'id'>
): ListingActionItem {
  return {
    title: 'Scarce',
    sellerId: 'greenghost.onsocial.testnet',
    priceNear: '0.5',
    bidCount: 0,
    expiresAtNs: null,
    ended: false,
    ...overrides,
  };
}

describe('listing action copy', () => {
  it('keeps primary CTAs short', () => {
    expect(listingActionPrimaryLabel('collect_win')).toBe('Collect');
    expect(listingActionPrimaryLabel('complete_sale')).toBe('Complete');
    expect(listingActionPrimaryLabel('cancel_auction')).toBe('Cancel');
    expect(listingActionPrimaryLabel('delist')).toBe('Delist');
    expect(listingActionPrimaryLabel('cancel_lazy')).toBe('Cancel');
  });

  it('uses confirming / canceling / delisting pending labels', () => {
    expect(listingActionPendingLabel('collect_win')).toBe('Confirming…');
    expect(listingActionPendingLabel('complete_sale')).toBe('Confirming…');
    expect(listingActionPendingLabel('cancel_auction')).toBe('Canceling…');
    expect(listingActionPendingLabel('delist')).toBe('Delisting…');
  });

  it('labels sections for auction vs listing context', () => {
    expect(listingActionSectionTitle('collect_win')).toBe('Won auctions');
    expect(listingActionSectionTitle('complete_sale')).toBe(
      'Sales to complete'
    );
    expect(listingActionSectionTitle('delist')).toBe('Your listings');
  });

  it('opens Market bid sheet only for settle kinds', () => {
    expect(listingActionOpensBidSheet('collect_win')).toBe(true);
    expect(listingActionOpensBidSheet('complete_sale')).toBe(true);
    expect(listingActionOpensBidSheet('delist')).toBe(false);
    expect(listingActionOpensBidSheet('cancel_auction')).toBe(false);
  });

  it('eyebrows stay short', () => {
    expect(listingActionEyebrow('collect_win')).toBe('You won');
    expect(listingActionEyebrow('complete_sale')).toBe('Sale ended');
    expect(listingActionEyebrow('delist')).toBe('Fixed');
  });

  it('keeps row meta compact without account ids or age', () => {
    const endedMs = Date.now() - 24 * 3_600_000;
    expect(
      listingActionRowMeta(
        base({
          id: 'collect_win:s:1',
          kind: 'collect_win',
          bidCount: 3,
          expiresAtNs: endedMs * 1e6,
          ended: true,
        })
      )
    ).toBe('3 bids · 0.5 NEAR');

    expect(
      listingActionRowMeta(
        base({
          id: 'delist:s:2',
          kind: 'delist',
          listedAtMs: Date.now() - 3 * 3_600_000,
        })
      )
    ).toBe('Fixed · 0.5 NEAR');
  });

  it('formats compact age and legacy Ended / Listed labels', () => {
    const endedMs = Date.now() - 5 * 60_000;
    const win = base({
      id: 'collect_win:s:1',
      kind: 'collect_win',
      bidCount: 2,
      expiresAtNs: endedMs * 1e6,
      ended: true,
    });
    expect(listingActionAgeLabel(win)).toBe('5m ago');
    expect(listingActionTimeLabel(win)).toBe('Ended 5m ago');

    const listed = base({
      id: 'delist:s:2',
      kind: 'delist',
      listedAtMs: Date.now() - 3 * 3_600_000,
    });
    expect(listingActionAgeLabel(listed)).toBe('3h ago');
    expect(listingActionTimeLabel(listed)).toBe('Listed 3h ago');
  });
});
