import type {
  StandingAccountSummary,
  StanceDetailKind,
} from '@/lib/profile-social-standings';

/** Minimal profile shell for injecting confirmed stands into stale list reads. */
export type StandingListSnapshot = Pick<
  StandingAccountSummary,
  'accountId' | 'name' | 'avatarUrl' | 'bio' | 'isDao'
>;

export type ViewerStandingLedgerEntry = {
  standing: boolean;
  snapshot?: StandingListSnapshot;
  /** Captured at toggle — drives solidarity count until indexer catches up. */
  theyStandWithViewer?: boolean;
};

export type PortfolioStandingCounts = {
  incoming: number;
  outgoing: number;
  mutual: number;
};

/** Confirmed standing overrides until read APIs catch up. */
export type ViewerStandingLedger = Map<string, ViewerStandingLedgerEntry>;

export function recordViewerStanding(
  ledger: ViewerStandingLedger,
  targetAccountId: string,
  standing: boolean,
  snapshot?: StandingListSnapshot,
  theyStandWithViewer?: boolean
): void {
  const previous = ledger.get(targetAccountId);
  ledger.set(targetAccountId, {
    standing,
    snapshot: snapshot ?? previous?.snapshot,
    theyStandWithViewer:
      theyStandWithViewer ?? previous?.theyStandWithViewer ?? false,
  });
}

function findLedgerEntry(
  ledger: ViewerStandingLedger,
  accountId: string
): ViewerStandingLedgerEntry | undefined {
  const normalized = accountId.trim().toLowerCase();
  for (const [key, entry] of ledger) {
    if (key.trim().toLowerCase() === normalized) {
      return entry;
    }
  }
  return undefined;
}

function clampStandingCount(value: number): number {
  return Math.max(0, value);
}

/** Live portfolio / standing-toolbar counts until read APIs reconcile the ledger. */
export function derivePortfolioStandingCounts({
  pageAccountId,
  viewerAccountId,
  counts,
  apiViewerStanding,
  theyStandWithViewer,
  ledger,
  relationshipKnown = true,
}: {
  pageAccountId: string;
  viewerAccountId: string | null;
  counts: PortfolioStandingCounts;
  apiViewerStanding: boolean;
  theyStandWithViewer: boolean;
  ledger: ViewerStandingLedger;
  relationshipKnown?: boolean;
}): PortfolioStandingCounts {
  if (!viewerAccountId) {
    return counts;
  }

  const pageId = pageAccountId.trim().toLowerCase();
  const viewerId = viewerAccountId.trim().toLowerCase();
  if (!pageId || !viewerId) {
    return counts;
  }

  let { incoming, outgoing, mutual } = counts;

  if (pageId === viewerId) {
    for (const [, entry] of ledger) {
      outgoing += entry.standing ? 1 : -1;
      if (entry.theyStandWithViewer) {
        mutual += entry.standing ? 1 : -1;
      }
    }
    return {
      incoming: clampStandingCount(incoming),
      outgoing: clampStandingCount(outgoing),
      mutual: clampStandingCount(mutual),
    };
  }

  if (!relationshipKnown) {
    return counts;
  }

  const entry = findLedgerEntry(ledger, pageAccountId);
  const effectiveStanding = entry ? entry.standing : apiViewerStanding;
  if (effectiveStanding === apiViewerStanding) {
    return counts;
  }

  incoming += effectiveStanding ? 1 : -1;
  if (theyStandWithViewer) {
    mutual += effectiveStanding ? 1 : -1;
  }

  return {
    incoming: clampStandingCount(incoming),
    outgoing: clampStandingCount(outgoing),
    mutual: clampStandingCount(mutual),
  };
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
    isDao: snapshot?.isDao,
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
