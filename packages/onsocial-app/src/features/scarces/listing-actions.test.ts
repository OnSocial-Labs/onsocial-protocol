import { describe, expect, it } from 'vitest';
import {
  listingActionAgeLabel,
  listingActionConfirmLabel,
  listingActionEyebrow,
  listingActionHasOffers,
  listingActionNeedsConfirm,
  listingActionOpensBidSheet,
  listingActionOpensBuySheet,
  listingActionPendingLabel,
  listingActionPrimaryLabel,
  listingActionRowMeta,
  listingActionSectionTitle,
  listingActionTimeLabel,
  listingManageConfirmCopy,
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
  it('surfaces offers only on native listed rows', () => {
    expect(
      listingActionHasOffers(
        base({
          id: 'delist:s:1',
          kind: 'delist',
          tokenId: 's:1',
          offerCount: 1,
          highestOfferNear: '0.5',
        })
      )
    ).toBe(true);
    expect(
      listingActionHasOffers(
        base({
          id: 'cancel_lazy:ll:1',
          kind: 'cancel_lazy',
          listingId: 'll:1',
          offerCount: 1,
          highestOfferNear: '0.5',
        })
      )
    ).toBe(false);
  });

  it('opens bid sheet for settle and cancel auction', () => {
    expect(listingActionOpensBidSheet('collect_win')).toBe(true);
    expect(listingActionOpensBidSheet('complete_sale')).toBe(true);
    expect(listingActionOpensBidSheet('cancel_auction')).toBe(true);
    expect(listingActionOpensBidSheet('delist')).toBe(false);
  });

  it('opens buy sheet for fixed and lazy manage rows', () => {
    expect(listingActionOpensBuySheet('delist')).toBe(true);
    expect(listingActionOpensBuySheet('cancel_lazy')).toBe(true);
    expect(listingActionOpensBuySheet('cancel_auction')).toBe(false);
  });

  it('arms two-press confirm for destructive manage CTAs', () => {
    expect(listingActionNeedsConfirm('delist')).toBe(true);
    expect(listingActionNeedsConfirm('cancel_auction')).toBe(true);
    expect(listingActionNeedsConfirm('cancel_lazy')).toBe(true);
    expect(listingActionNeedsConfirm('collect_win')).toBe(false);
    expect(listingActionConfirmLabel('delist')).toBe('Delist?');
    expect(listingActionConfirmLabel('cancel_lazy')).toBe('Cancel?');
  });

  it('uses a short danger confirm for Time Listings delist', () => {
    const listed = base({
      id: 'delist:s:1',
      kind: 'delist',
      title: "What's up #OnSocial",
      tokenId: 's:1',
    });
    expect(listingManageConfirmCopy(listed)).toEqual({
      title: "Delist What's up #OnSocial?",
      body: 'This takes it off the market. You can list it again anytime.',
      confirmLabel: 'Delist',
      discardLabel: 'Discard',
      pendingLabel: 'Delisting…',
    });
    expect(
      listingManageConfirmCopy({
        ...listed,
        offerCount: 2,
        highestOfferNear: '0.5',
      }).body
    ).toBe(
      'This takes it off the market. Open offers stay — you can still accept them.'
    );
  });

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
    expect(listingActionSectionTitle('delist')).toBe('');
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

    expect(
      listingActionRowMeta(
        base({
          id: 'delist:s:3',
          kind: 'delist',
          tokenId: 's:3',
          offerCount: 1,
          highestOfferNear: '0.5',
        })
      )
    ).toBe('Fixed · 0.5 NEAR · Offer 0.5 NEAR');

    expect(
      listingActionRowMeta(
        base({
          id: 'delist:s:4',
          kind: 'delist',
          tokenId: 's:4',
          offerCount: 2,
          highestOfferNear: '1',
        })
      )
    ).toBe('Fixed · 0.5 NEAR · 2 offers · top 1 NEAR');
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
