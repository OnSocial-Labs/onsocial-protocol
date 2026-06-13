import { PROFILE_SEARCH_MIN_QUERY_LENGTH } from '@/lib/profile-account-search';

export type StanceDetailKind = 'incoming' | 'outgoing' | 'mutual';

export interface StandingAccountSummary {
  accountId: string;
  name: string | null;
  bio?: string | null;
  avatarUrl: string | null;
  standingSince?: number | null;
  standingBlockTimestamp?: number | null;
  standingCount?: number;
  standingWithCount?: number;
  mutualStandingCount?: number;
  endorsementsReceivedCount?: number;
  endorsementsGivenCount?: number;
  viewerStanding?: boolean;
  theyStandWithViewer?: boolean;
}

export interface ProfileSocialStandingsResponse {
  accountId: string;
  direction: StanceDetailKind;
  limit: number;
  offset: number;
  hasMore: boolean;
  total: number;
  counts?: { incoming: number; outgoing: number; mutual: number };
  accounts: StandingAccountSummary[];
}

export const STANCE_PAGE_SIZE = 24;

export function formatProfileCount(count: number): string {
  const numericCount = Number(count);
  if (!Number.isFinite(numericCount)) return '0';

  return new Intl.NumberFormat('en-US', {
    maximumFractionDigits:
      Math.abs(numericCount) >= 1000 && Math.abs(numericCount) < 100000 ? 1 : 0,
    notation: Math.abs(numericCount) >= 1000 ? 'compact' : 'standard',
  }).format(numericCount);
}

export function mergeStandingAccounts(
  current: StandingAccountSummary[],
  incoming: StandingAccountSummary[]
): StandingAccountSummary[] {
  if (incoming.length === 0) return current;

  const seen = new Set(current.map((account) => account.accountId));
  const merged = [...current];
  for (const account of incoming) {
    if (seen.has(account.accountId)) continue;
    seen.add(account.accountId);
    merged.push(account);
  }
  return merged;
}

function normalizeStandingAccount(
  account: StandingAccountSummary
): StandingAccountSummary {
  return {
    ...account,
    standingCount: Number(account.standingCount ?? 0),
    standingWithCount: Number(account.standingWithCount ?? 0),
    mutualStandingCount: Number(account.mutualStandingCount ?? 0),
    endorsementsReceivedCount: Number(account.endorsementsReceivedCount ?? 0),
    endorsementsGivenCount: Number(account.endorsementsGivenCount ?? 0),
    viewerStanding: Boolean(account.viewerStanding),
    theyStandWithViewer: Boolean(account.theyStandWithViewer),
  };
}

export async function fetchProfileSocialStandings(
  accountId: string,
  viewerAccountId: string | null,
  direction: StanceDetailKind,
  offset: number,
  q = ''
): Promise<ProfileSocialStandingsResponse> {
  const search = new URLSearchParams({
    accountId,
    direction,
    limit: String(STANCE_PAGE_SIZE),
    offset: String(offset),
  });
  if (viewerAccountId) search.set('viewerAccountId', viewerAccountId);
  const normalizedQuery = q.trim();
  if (normalizedQuery.length >= PROFILE_SEARCH_MIN_QUERY_LENGTH) {
    search.set('q', normalizedQuery);
  }

  const response = await fetch(
    `/api/profile/social/standings?${search.toString()}`,
    { cache: 'no-store' }
  );
  const body = (await response.json().catch(() => null)) as
    | (Partial<ProfileSocialStandingsResponse> & {
        error?: string;
        detail?: string;
      })
    | null;

  if (!response.ok) {
    throw new Error(
      body?.detail ??
        body?.error ??
        `Social standings query failed (${response.status})`
    );
  }

  return {
    accountId,
    direction,
    limit: body?.limit ?? STANCE_PAGE_SIZE,
    offset: body?.offset ?? offset,
    hasMore: Boolean(body?.hasMore),
    total: Number(body?.total ?? 0),
    ...(body?.counts ? { counts: body.counts } : {}),
    accounts: (body?.accounts ?? []).map((account) =>
      normalizeStandingAccount(account as StandingAccountSummary)
    ),
  };
}
