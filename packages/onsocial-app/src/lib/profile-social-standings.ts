import type { PageMoodId } from '@onsocial/sdk';
import {
  isProfileSearchQuery,
  normalizeProfileSearchQuery,
} from '@/lib/profile-account-search';

export type StanceDetailKind = 'incoming' | 'outgoing' | 'mutual';

export const STANCE_DETAIL_KINDS: StanceDetailKind[] = [
  'incoming',
  'outgoing',
  'mutual',
];

export function parseStandingKind(raw: string | undefined): StanceDetailKind {
  if (raw === 'outgoing' || raw === 'mutual') {
    return raw;
  }
  return 'incoming';
}

/** Read standing tab from a portfolio standing pathname (full-page or overlay URL). */
export function parseStandingKindFromPathname(
  pathname: string
): StanceDetailKind | null {
  const match = pathname.match(/\/standing\/(incoming|outgoing|mutual)(?:\/|$|\?)/);
  return match ? parseStandingKind(match[1]) : null;
}

export function standingPath(
  accountId: string,
  kind: StanceDetailKind = 'incoming',
  q?: string | null
): string {
  const base = `/@${encodeURIComponent(accountId)}/standing/${kind}`;
  const normalized = normalizeProfileSearchQuery(q);
  if (isProfileSearchQuery(normalized)) {
    return `${base}?q=${encodeURIComponent(normalized)}`;
  }
  return base;
}

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
  targetEndorsedViewer?: boolean;
  moodId?: PageMoodId;
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

export async function fetchViewerStandingRelationship(
  pageAccountId: string,
  viewerAccountId: string
): Promise<{ viewerStanding: boolean; theyStandWithViewer: boolean }> {
  const search = new URLSearchParams({
    accountId: pageAccountId,
    viewerAccountId,
  });

  const response = await fetch(
    `/api/profile/social/relationship?${search.toString()}`,
    { cache: 'no-store' }
  );
  const body = (await response.json().catch(() => null)) as
    | ({
        viewerStanding?: boolean;
        theyStandWithViewer?: boolean;
        error?: string;
        detail?: string;
      })
    | null;

  if (!response.ok) {
    throw new Error(
      body?.detail ??
        body?.error ??
        `Standing relationship lookup failed (${response.status})`
    );
  }

  return {
    viewerStanding: Boolean(body?.viewerStanding),
    theyStandWithViewer: Boolean(body?.theyStandWithViewer),
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
  if (viewerAccountId) {
    search.set('viewerAccountId', viewerAccountId);
  }
  const normalizedQuery = normalizeProfileSearchQuery(q);
  if (isProfileSearchQuery(normalizedQuery)) {
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
    accounts: body?.accounts ?? [],
  };
}

export function standViewLabel(
  kind: StanceDetailKind,
  isSelf: boolean
): string {
  if (kind === 'mutual') return 'Solidarity';
  if (kind === 'incoming') return isSelf ? 'With you' : 'With them';
  return isSelf ? 'Standing with' : 'They stand with';
}
