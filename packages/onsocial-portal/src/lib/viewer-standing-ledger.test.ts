import { describe, expect, it } from 'vitest';

import type { StandingAccountSummary } from '@/lib/profile-social-standings';
import {
  deriveStandingAccountsList,
  deriveStandingPresentation,
  reconcileViewerStanding,
  recordViewerStanding,
  resolveViewerStanding,
} from '@/lib/viewer-standing-ledger';

describe('viewer-standing-ledger', () => {
  it('prefers confirmed ledger standing over stale API reads', () => {
    const ledger = new Map();
    recordViewerStanding(ledger, 'alice.testnet', true);

    expect(resolveViewerStanding(ledger, 'alice.testnet', false)).toBe(true);
  });

  it('derives profile social counts when ledger overrides standing', () => {
    const ledger = new Map();
    recordViewerStanding(ledger, 'alice.testnet', true);

    const derived = deriveStandingPresentation(
      {
        viewerStanding: false,
        counts: { incoming: 2, outgoing: 1, mutual: 0 },
      },
      'alice.testnet',
      ledger
    );

    expect(derived.viewerStanding).toBe(true);
    expect(derived.counts.incoming).toBe(3);
  });

  it('reconciles ledger when API catches up', () => {
    const ledger = new Map();
    recordViewerStanding(ledger, 'alice.testnet', true);

    expect(reconcileViewerStanding(ledger, 'alice.testnet', true)).toBe(true);
    expect(ledger.has('alice.testnet')).toBe(false);
  });

  it('injects confirmed stands into the viewer outgoing list', () => {
    const ledger = new Map();
    recordViewerStanding(ledger, 'bob.testnet', true, {
      accountId: 'bob.testnet',
      name: 'Bob',
      avatarUrl: null,
      bio: 'Builder',
    });

    const { accounts, totalAdjustment } = deriveStandingAccountsList({
      accounts: [],
      ledger,
      kind: 'outgoing',
      listAccountId: 'alice.testnet',
      viewerAccountId: 'alice.testnet',
    });

    expect(accounts).toHaveLength(1);
    expect(accounts[0]?.accountId).toBe('bob.testnet');
    expect(accounts[0]?.name).toBe('Bob');
    expect(accounts[0]?.viewerStanding).toBe(true);
    expect(totalAdjustment).toBe(1);
  });

  it('removes unstood accounts from the viewer outgoing list', () => {
    const ledger = new Map();
    recordViewerStanding(ledger, 'bob.testnet', false);

    const existing: StandingAccountSummary[] = [
      {
        accountId: 'bob.testnet',
        name: 'Bob',
        avatarUrl: null,
        viewerStanding: true,
      },
    ];

    const { accounts, totalAdjustment } = deriveStandingAccountsList({
      accounts: existing,
      ledger,
      kind: 'outgoing',
      listAccountId: 'alice.testnet',
      viewerAccountId: 'alice.testnet',
    });

    expect(accounts).toHaveLength(0);
    expect(totalAdjustment).toBe(-1);
  });
});
