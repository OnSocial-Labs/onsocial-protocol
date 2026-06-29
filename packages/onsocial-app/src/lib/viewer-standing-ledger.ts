import type {
  StandingAccountSummary,
  StanceDetailKind,
} from '@/lib/profile-social-standings';

/** Minimal profile shell for injecting confirmed stands into stale list reads. */
export type StandingListSnapshot = Pick<
  StandingAccountSummary,
  'accountId' | 'name' | 'avatarUrl' | 'bio'
>;

export type ViewerStandingLedgerEntry = {
  standing: boolean;
  snapshot?: StandingListSnapshot;
};

/** Confirmed standing overrides until read APIs catch up. */
export type ViewerStandingLedger = Map<string, ViewerStandingLedgerEntry>;

export function recordViewerStanding(
  ledger: ViewerStandingLedger,
  targetAccountId: string,
  standing: boolean,
  snapshot?: StandingListSnapshot
): void {
  if (standing) {
    ledger.set(targetAccountId, {
      standing: true,
      snapshot: snapshot ?? ledger.get(targetAccountId)?.snapshot,
    });
    return;
  }
  ledger.set(targetAccountId, {
    standing: false,
    snapshot: ledger.get(targetAccountId)?.snapshot,
  });
}

export function resolveViewerStanding(
  ledger: ViewerStandingLedger,
  targetAccountId: string,
  apiStanding: boolean
): boolean {
  const entry = ledger.get(targetAccountId);
  if (!entry) {
    return apiStanding;
  }
  return entry.standing;
}

export function reconcileViewerStanding(
  ledger: ViewerStandingLedger,
  targetAccountId: string,
  apiStanding: boolean
): boolean {
  const entry = ledger.get(targetAccountId);
  if (!entry || entry.standing !== apiStanding) {
    return false;
  }
  return ledger.delete(targetAccountId);
}

export function reconcileStandingListFromApi(
  ledger: ViewerStandingLedger,
  accounts: StandingAccountSummary[]
): boolean {
  let changed = false;
  for (const account of accounts) {
    if (
      reconcileViewerStanding(
        ledger,
        account.accountId,
        Boolean(account.viewerStanding)
      )
    ) {
      changed = true;
    }
  }
  return changed;
}

function buildInjectedStandingAccount(
  accountId: string,
  entry: ViewerStandingLedgerEntry
): StandingAccountSummary {
  const now = Date.now();
  const snapshot = entry.snapshot;
  return {
    accountId,
    name: snapshot?.name ?? null,
    bio: snapshot?.bio ?? null,
    avatarUrl: snapshot?.avatarUrl ?? null,
    viewerStanding: true,
    theyStandWithViewer: false,
    standingSince: now,
    standingBlockTimestamp: now,
  };
}

export function deriveStandingAccountsList({
  accounts,
  ledger,
  kind,
  listAccountId,
  viewerAccountId,
}: {
  accounts: StandingAccountSummary[];
  ledger: ViewerStandingLedger;
  kind: StanceDetailKind;
  listAccountId: string;
  viewerAccountId: string | null;
}): {
  accounts: StandingAccountSummary[];
  totalAdjustment: number;
} {
  const isViewerOwnList =
    Boolean(viewerAccountId) && listAccountId === viewerAccountId;
  const seen = new Set<string>();
  let totalAdjustment = 0;

  let derived = accounts.map((account) => {
    seen.add(account.accountId);
    const apiStanding = Boolean(account.viewerStanding);
    const viewerStanding = resolveViewerStanding(
      ledger,
      account.accountId,
      apiStanding
    );
    if (viewerStanding === apiStanding) {
      return account;
    }
    return { ...account, viewerStanding };
  });

  if (!isViewerOwnList || ledger.size === 0) {
    return { accounts: derived, totalAdjustment: 0 };
  }

  if (kind === 'outgoing' || kind === 'mutual') {
    const beforeCount = derived.length;
    derived = derived.filter((account) => {
      const entry = ledger.get(account.accountId);
      if (!entry) return true;
      return entry.standing;
    });
    totalAdjustment += derived.length - beforeCount;
  }

  if (kind === 'outgoing') {
    const injected: StandingAccountSummary[] = [];
    for (const [accountId, entry] of ledger) {
      if (!entry.standing || seen.has(accountId)) continue;
      injected.push(buildInjectedStandingAccount(accountId, entry));
      seen.add(accountId);
    }
    if (injected.length > 0) {
      derived = [...injected, ...derived];
      derived.sort((a, b) => (b.standingSince ?? 0) - (a.standingSince ?? 0));
      totalAdjustment += injected.length;
    }
  }

  return { accounts: derived, totalAdjustment };
}

export function shouldFreshFetchStandingList(
  ledger: ViewerStandingLedger,
  listAccountId: string,
  viewerAccountId: string | null,
  kind: StanceDetailKind
): boolean {
  if (!viewerAccountId || listAccountId !== viewerAccountId) return false;
  if (kind !== 'outgoing' && kind !== 'mutual') return false;
  return ledger.size > 0;
}
