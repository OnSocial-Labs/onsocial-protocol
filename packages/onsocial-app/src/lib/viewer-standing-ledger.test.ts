import { describe, expect, it } from 'vitest';
import type { StandingAccountSummary } from './profile-social-standings';
import {
  derivePortfolioStandingCounts,
  deriveStandingAccountsList,
  recordViewerStanding,
  type ViewerStandingLedger,
} from './viewer-standing-ledger';

function standingRow(
  overrides: Partial<StandingAccountSummary> = {}
): StandingAccountSummary {
  return {
    accountId: 'alice.testnet',
    name: 'Alice',
    avatarUrl: null,
    standingCount: 9,
    standingWithCount: 4,
    mutualStandingCount: 2,
    viewerStanding: false,
    theyStandWithViewer: false,
    ...overrides,
  };
}

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
    recordViewerStanding(ledger, 'alice.testnet', true, undefined, true);

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

describe('deriveStandingAccountsList row counts', () => {
  const list = {
    kind: 'incoming' as const,
    listAccountId: 'carol.testnet',
    viewerAccountId: 'bob.testnet',
  };

  it('raises the stand-with-them count when the viewer stands', () => {
    const ledger: ViewerStandingLedger = new Map();
    recordViewerStanding(ledger, 'alice.testnet', true);

    const { accounts } = deriveStandingAccountsList({
      ...list,
      accounts: [standingRow()],
      ledger,
    });

    expect(accounts[0]).toMatchObject({
      viewerStanding: true,
      standingCount: 10,
      standingWithCount: 4,
      mutualStandingCount: 2,
    });
  });

  it('raises solidarity when they already stand with the viewer', () => {
    const ledger: ViewerStandingLedger = new Map();
    recordViewerStanding(ledger, 'alice.testnet', true, undefined, true);

    const { accounts } = deriveStandingAccountsList({
      ...list,
      accounts: [standingRow({ theyStandWithViewer: true })],
      ledger,
    });

    expect(accounts[0]).toMatchObject({
      standingCount: 10,
      mutualStandingCount: 3,
      standingWithCount: 4,
    });
  });

  it('lowers both counts when the viewer steps back from solidarity', () => {
    const ledger: ViewerStandingLedger = new Map();
    recordViewerStanding(ledger, 'alice.testnet', false, undefined, true);

    const { accounts } = deriveStandingAccountsList({
      ...list,
      accounts: [
        standingRow({
          viewerStanding: true,
          theyStandWithViewer: true,
          standingCount: 10,
          mutualStandingCount: 3,
        }),
      ],
      ledger,
    });

    expect(accounts[0]).toMatchObject({
      viewerStanding: false,
      standingCount: 9,
      mutualStandingCount: 2,
      standingWithCount: 4,
    });
  });

  it('keeps the indexed counts once the row already matches the ledger', () => {
    const ledger: ViewerStandingLedger = new Map();
    recordViewerStanding(ledger, 'alice.testnet', true, undefined, true);

    const { accounts } = deriveStandingAccountsList({
      ...list,
      accounts: [
        standingRow({
          viewerStanding: true,
          theyStandWithViewer: true,
          standingCount: 10,
          mutualStandingCount: 3,
        }),
      ],
      ledger,
    });

    expect(accounts[0]).toMatchObject({
      standingCount: 10,
      mutualStandingCount: 3,
    });
  });

  it('does not drop a count below zero', () => {
    const ledger: ViewerStandingLedger = new Map();
    recordViewerStanding(ledger, 'alice.testnet', false);

    const { accounts } = deriveStandingAccountsList({
      ...list,
      accounts: [
        standingRow({
          viewerStanding: true,
          standingCount: 0,
          mutualStandingCount: 0,
        }),
      ],
      ledger,
    });

    expect(accounts[0]?.standingCount).toBe(0);
  });
});
