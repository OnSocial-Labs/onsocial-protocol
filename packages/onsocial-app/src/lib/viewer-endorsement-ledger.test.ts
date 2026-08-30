import { describe, expect, it } from 'vitest';
import type { EndorsementPanelItem } from '@/lib/endorsements-panel-data';
import {
  deriveEndorsementListItems,
  derivePortfolioEndorsementCounts,
  overlayViewerEndorsedOnAccounts,
  recordViewerEndorse,
  recordViewerEndorseRemove,
  reconcileViewerEndorsement,
  resolveViewerEndorsed,
  shouldFreshFetchEndorsementList,
  type ViewerEndorsementLedger,
} from './viewer-endorsement-ledger';

function item(
  partial: Partial<EndorsementPanelItem> &
    Pick<EndorsementPanelItem, 'issuer' | 'target'>
): EndorsementPanelItem {
  return {
    v: 1,
    since: 1,
    blockHeight: 1,
    blockTimestamp: 1,
    issuerName: null,
    issuerAvatarUrl: null,
    targetName: null,
    targetAvatarUrl: null,
    mediaUrl: null,
    ...partial,
  };
}

describe('derivePortfolioEndorsementCounts', () => {
  const base = { received: 10, given: 5 };

  it('bumps received when viewer first endorses another profile', () => {
    const ledger: ViewerEndorsementLedger = new Map();
    recordViewerEndorse(ledger, 'alice.testnet', 'design');

    expect(
      derivePortfolioEndorsementCounts({
        pageAccountId: 'alice.testnet',
        viewerAccountId: 'bob.testnet',
        counts: base,
        apiViewerEndorsed: false,
        ledger,
      })
    ).toEqual({ received: 11, given: 5 });
  });

  it('bumps received once per topic so chips match the list', () => {
    const ledger: ViewerEndorsementLedger = new Map();
    recordViewerEndorse(ledger, 'alice.testnet', 'design');
    recordViewerEndorse(ledger, 'alice.testnet', 'product');

    expect(
      derivePortfolioEndorsementCounts({
        pageAccountId: 'alice.testnet',
        viewerAccountId: 'bob.testnet',
        counts: base,
        apiViewerEndorsed: false,
        apiViewerEndorsementTopics: [],
        ledger,
      })
    ).toEqual({ received: 12, given: 5 });
  });

  it('only adds the missing topic when the API already has one', () => {
    const ledger: ViewerEndorsementLedger = new Map();
    recordViewerEndorse(ledger, 'alice.testnet', 'design');
    recordViewerEndorse(ledger, 'alice.testnet', 'product');

    expect(
      derivePortfolioEndorsementCounts({
        pageAccountId: 'alice.testnet',
        viewerAccountId: 'bob.testnet',
        counts: { received: 11, given: 5 },
        apiViewerEndorsed: true,
        apiViewerEndorsementTopics: ['design'],
        ledger,
      })
    ).toEqual({ received: 12, given: 5 });
  });

  it('does not bump when moving a topic on an already-endorsed peer', () => {
    const ledger: ViewerEndorsementLedger = new Map();
    recordViewerEndorse(ledger, 'alice.testnet', 'design');
    recordViewerEndorse(ledger, 'alice.testnet', 'product', {
      previousTopic: 'design',
    });

    expect(
      derivePortfolioEndorsementCounts({
        pageAccountId: 'alice.testnet',
        viewerAccountId: 'bob.testnet',
        counts: { received: 11, given: 5 },
        apiViewerEndorsed: true,
        apiViewerEndorsementTopics: ['design'],
        ledger,
      })
    ).toEqual({ received: 11, given: 5 });
  });

  it('drops received when the last topic is removed', () => {
    const ledger: ViewerEndorsementLedger = new Map();
    recordViewerEndorse(ledger, 'alice.testnet', 'design');
    recordViewerEndorseRemove(ledger, 'alice.testnet', 'design');

    expect(
      derivePortfolioEndorsementCounts({
        pageAccountId: 'alice.testnet',
        viewerAccountId: 'bob.testnet',
        counts: { received: 11, given: 5 },
        apiViewerEndorsed: true,
        apiViewerEndorsementTopics: ['design'],
        ledger,
      })
    ).toEqual({ received: 10, given: 5 });
  });

  it('adjusts given on own portfolio by topic rows', () => {
    const ledger: ViewerEndorsementLedger = new Map();
    recordViewerEndorse(ledger, 'alice.testnet', 'design');
    recordViewerEndorse(ledger, 'alice.testnet', 'product');
    recordViewerEndorse(ledger, 'carol.testnet', '');

    expect(
      derivePortfolioEndorsementCounts({
        pageAccountId: 'bob.testnet',
        viewerAccountId: 'bob.testnet',
        counts: base,
        apiViewerEndorsed: false,
        ledger,
      })
    ).toEqual({ received: 10, given: 8 });
  });

  it('does not double-adjust after API reconcile clears the ledger', () => {
    const ledger: ViewerEndorsementLedger = new Map();
    recordViewerEndorse(ledger, 'alice.testnet', 'design');
    reconcileViewerEndorsement(ledger, 'alice.testnet', ['design']);

    expect(
      derivePortfolioEndorsementCounts({
        pageAccountId: 'alice.testnet',
        viewerAccountId: 'bob.testnet',
        counts: { received: 11, given: 5 },
        apiViewerEndorsed: true,
        ledger,
      })
    ).toEqual({ received: 11, given: 5 });
  });
});

describe('resolveViewerEndorsed', () => {
  it('uses the ledger while an override is present', () => {
    const ledger: ViewerEndorsementLedger = new Map();
    recordViewerEndorse(ledger, 'alice.testnet', 'design');
    expect(resolveViewerEndorsed(ledger, 'alice.testnet', false)).toBe(true);

    recordViewerEndorseRemove(ledger, 'alice.testnet', 'design');
    expect(resolveViewerEndorsed(ledger, 'alice.testnet', true)).toBe(false);
  });

  it('falls back to the API when the ledger is empty', () => {
    expect(resolveViewerEndorsed(new Map(), 'alice.testnet', true)).toBe(true);
  });

  it('overlays ledger Endorsed onto list rows', () => {
    const ledger: ViewerEndorsementLedger = new Map();
    recordViewerEndorse(ledger, 'alice.testnet', 'design');

    expect(
      overlayViewerEndorsedOnAccounts(
        [
          { accountId: 'alice.testnet', viewerEndorsed: false },
          { accountId: 'carol.testnet', viewerEndorsed: true },
        ],
        ledger
      )
    ).toEqual([
      { accountId: 'alice.testnet', viewerEndorsed: true },
      { accountId: 'carol.testnet', viewerEndorsed: true },
    ]);
  });
});

describe('deriveEndorsementListItems', () => {
  it('injects a confirmed given row until the indexer returns it', () => {
    const ledger: ViewerEndorsementLedger = new Map();
    recordViewerEndorse(ledger, 'alice.testnet', 'design', {
      snapshot: {
        accountId: 'alice.testnet',
        name: 'Alice',
        avatarUrl: null,
      },
    });

    const derived = deriveEndorsementListItems({
      items: [],
      ledger,
      mode: 'given',
      listAccountId: 'bob.testnet',
      viewerAccountId: 'bob.testnet',
    });

    expect(derived.items).toHaveLength(1);
    expect(derived.items[0]).toMatchObject({
      issuer: 'bob.testnet',
      target: 'alice.testnet',
      topic: 'design',
      targetName: 'Alice',
    });
  });

  it('fills received issuer shell and draft media on inject', () => {
    const ledger: ViewerEndorsementLedger = new Map();
    recordViewerEndorse(ledger, 'alice.testnet', 'design', {
      snapshot: {
        accountId: 'alice.testnet',
        name: 'Alice',
        avatarUrl: 'https://cdn/alice.png',
      },
      issuerSnapshot: {
        accountId: 'bob.testnet',
        name: 'Bob',
        avatarUrl: 'https://cdn/bob.png',
      },
      draft: {
        topic: 'design',
        note: 'Shipped it.',
        id: 'e1',
        media: { cid: 'bafy', mime: 'image/jpeg' },
        mediaUrl: 'https://cdn/vouch.jpg',
      },
    });

    const derived = deriveEndorsementListItems({
      items: [],
      ledger,
      mode: 'received',
      listAccountId: 'alice.testnet',
      viewerAccountId: 'bob.testnet',
    });

    expect(derived.items).toHaveLength(1);
    expect(derived.items[0]).toMatchObject({
      issuer: 'bob.testnet',
      issuerName: 'Bob',
      issuerAvatarUrl: 'https://cdn/bob.png',
      targetName: 'Alice',
      note: 'Shipped it.',
      mediaUrl: 'https://cdn/vouch.jpg',
      media: { cid: 'bafy', mime: 'image/jpeg' },
    });
  });

  it('hides a removed topic from the received list', () => {
    const ledger: ViewerEndorsementLedger = new Map();
    recordViewerEndorseRemove(ledger, 'alice.testnet', 'design');

    const derived = deriveEndorsementListItems({
      items: [
        item({
          issuer: 'bob.testnet',
          target: 'alice.testnet',
          topic: 'design',
        }),
        item({
          issuer: 'carol.testnet',
          target: 'alice.testnet',
          topic: 'research',
        }),
      ],
      ledger,
      mode: 'received',
      listAccountId: 'alice.testnet',
      viewerAccountId: 'bob.testnet',
    });

    expect(derived.items.map((row) => row.issuer)).toEqual(['carol.testnet']);
  });
});

describe('shouldFreshFetchEndorsementList', () => {
  it('retries the viewer given list while overrides remain', () => {
    const ledger: ViewerEndorsementLedger = new Map();
    recordViewerEndorse(ledger, 'alice.testnet', 'design');

    expect(
      shouldFreshFetchEndorsementList(
        ledger,
        'bob.testnet',
        'bob.testnet',
        'given'
      )
    ).toBe(true);
    expect(
      shouldFreshFetchEndorsementList(
        ledger,
        'alice.testnet',
        'bob.testnet',
        'received'
      )
    ).toBe(true);
    expect(
      shouldFreshFetchEndorsementList(
        ledger,
        'carol.testnet',
        'bob.testnet',
        'received'
      )
    ).toBe(false);
  });
});
