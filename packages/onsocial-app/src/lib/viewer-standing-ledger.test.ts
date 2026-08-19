import { describe, expect, it } from 'vitest';
import {
  derivePortfolioStandingCounts,
  recordViewerStanding,
  type ViewerStandingLedger,
} from './viewer-standing-ledger';

describe('derivePortfolioStandingCounts', () => {
  const base = { incoming: 10, outgoing: 5, mutual: 2 };

  it('bumps incoming when viewer stands on another profile', () => {
    const ledger: ViewerStandingLedger = new Map();
    recordViewerStanding(ledger, 'alice.testnet', true);

    expect(
      derivePortfolioStandingCounts({
        pageAccountId: 'alice.testnet',
        viewerAccountId: 'bob.testnet',
        counts: base,
        apiViewerStanding: false,
        theyStandWithViewer: false,
        ledger,
      })
    ).toEqual({ incoming: 11, outgoing: 5, mutual: 2 });
  });

  it('bumps mutual when they already stand with viewer', () => {
    const ledger: ViewerStandingLedger = new Map();
    recordViewerStanding(
      ledger,
      'alice.testnet',
      true,
      undefined,
      true
    );

    expect(
      derivePortfolioStandingCounts({
        pageAccountId: 'alice.testnet',
        viewerAccountId: 'bob.testnet',
        counts: base,
        apiViewerStanding: false,
        theyStandWithViewer: true,
        ledger,
      })
    ).toEqual({ incoming: 11, outgoing: 5, mutual: 3 });
  });

  it('adjusts outgoing on own portfolio from ledger entries', () => {
    const ledger: ViewerStandingLedger = new Map();
    recordViewerStanding(ledger, 'alice.testnet', true, undefined, true);

    expect(
      derivePortfolioStandingCounts({
        pageAccountId: 'bob.testnet',
        viewerAccountId: 'bob.testnet',
        counts: base,
        apiViewerStanding: false,
        theyStandWithViewer: false,
        ledger,
      })
    ).toEqual({ incoming: 10, outgoing: 6, mutual: 3 });
  });

  it('does not double-adjust after API reconcile clears the ledger', () => {
    expect(
      derivePortfolioStandingCounts({
        pageAccountId: 'alice.testnet',
        viewerAccountId: 'bob.testnet',
        counts: { incoming: 11, outgoing: 5, mutual: 2 },
        apiViewerStanding: true,
        theyStandWithViewer: false,
        ledger: new Map(),
      })
    ).toEqual({ incoming: 11, outgoing: 5, mutual: 2 });
  });
});
