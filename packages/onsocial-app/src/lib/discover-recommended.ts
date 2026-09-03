import type { DiscoverFaceFilter, OnSocial } from '@onsocial/sdk';
import { accountIdsEqual } from '@/lib/account-match';
import { discoverPageToProfileListAccounts } from '@/lib/discover-profiles';
import { filterTrendingProfiles } from '@/lib/discover-trending-filter';
import type { ProfileListAccount } from '@/lib/profile-list-account';

/** Two shared standers — one hop off a popular account is spam. */
export const RECOMMENDED_MIN_SHARED = 2;
export const RECOMMENDED_PEEK_LIMIT = 6;
export const RECOMMENDED_HYDRATE_LIMIT = 24;
export const RECOMMENDED_FRIEND_LIMIT = 48;
export const RECOMMENDED_EDGE_LIMIT = 480;

export interface StandingRecommendationEdge {
  accountId: string;
  targetAccount: string;
}

export interface StandingRecommendation {
  accountId: string;
  sharedCount: number;
}

export interface RankStandingRecommendationsInput {
  viewerAccountId: string;
  viewerOutgoing: readonly string[];
  friendOutgoing: readonly StandingRecommendationEdge[];
  minShared?: number;
  limit?: number;
}

function normalizeAccountId(accountId: string): string {
  return accountId.trim().toLowerCase();
}

/** Friends-of-friends standing recs. Same graph for people and orgs. */
export function rankStandingRecommendations({
  viewerAccountId,
  viewerOutgoing,
  friendOutgoing,
  minShared = RECOMMENDED_MIN_SHARED,
  limit = RECOMMENDED_HYDRATE_LIMIT,
}: RankStandingRecommendationsInput): StandingRecommendation[] {
  const viewer = normalizeAccountId(viewerAccountId);
  if (!viewer || minShared < 1 || limit <= 0) return [];

  const excluded = new Set<string>([viewer]);
  const friendSet = new Set<string>();
  for (const id of viewerOutgoing) {
    const key = normalizeAccountId(id);
    if (!key) continue;
    excluded.add(key);
    friendSet.add(key);
  }
  if (friendSet.size < minShared) return [];

  const sharedBy = new Map<string, Set<string>>();
  const displayId = new Map<string, string>();
  const firstSeen: string[] = [];

  for (const edge of friendOutgoing) {
    const friend = normalizeAccountId(edge.accountId);
    const target = normalizeAccountId(edge.targetAccount);
    if (!friend || !target) continue;
    if (!friendSet.has(friend)) continue;
    if (friend === target) continue;
    if (excluded.has(target)) continue;

    let standers = sharedBy.get(target);
    if (!standers) {
      standers = new Set();
      sharedBy.set(target, standers);
      displayId.set(target, edge.targetAccount.trim());
      firstSeen.push(target);
    }
    standers.add(friend);
  }

  return firstSeen
    .map((key) => ({
      accountId: displayId.get(key) ?? key,
      sharedCount: sharedBy.get(key)?.size ?? 0,
    }))
    .filter((row) => row.sharedCount >= minShared)
    .sort((left, right) => {
      const byShared = right.sharedCount - left.sharedCount;
      if (byShared !== 0) return byShared;
      return (
        firstSeen.indexOf(normalizeAccountId(left.accountId)) -
        firstSeen.indexOf(normalizeAccountId(right.accountId))
      );
    })
    .slice(0, limit);
}

export function excludeRecommendedFromList<T extends { accountId: string }>(
  accounts: readonly T[],
  recommendedIds: readonly string[]
): T[] {
  if (recommendedIds.length === 0) return accounts as T[];
  return accounts.filter(
    (row) => !recommendedIds.some((id) => accountIdsEqual(row.accountId, id))
  );
}

/** Grow-only min-height so excluding Recommended ids does not collapse the list. */
export function nextDiscoverListMinHeight(
  previousPx: number | null | undefined,
  measuredPx: number
): number | null {
  if (!Number.isFinite(measuredPx) || measuredPx <= 0) {
    return previousPx ?? null;
  }
  if (previousPx == null || previousPx <= 0) return measuredPx;
  return Math.max(previousPx, measuredPx);
}

export function filterRecommendedPeek(
  rows: ProfileListAccount[],
  face: DiscoverFaceFilter = 'all',
  industry = '',
  limit = RECOMMENDED_PEEK_LIMIT
): ProfileListAccount[] {
  return filterTrendingProfiles(rows, '', face, industry).slice(0, limit);
}

function orderRowsByAccountIdsCi<T extends { accountId: string }>(
  rows: T[],
  ids: string[]
): T[] {
  const byId = new Map(
    rows.map((row) => [normalizeAccountId(row.accountId), row])
  );
  const out: T[] = [];
  for (const id of ids) {
    const row = byId.get(normalizeAccountId(id));
    if (row) out.push(row);
  }
  return out;
}

async function fetchFriendOutgoingEdges(
  os: OnSocial,
  friendIds: string[],
  limit: number
): Promise<StandingRecommendationEdge[]> {
  if (friendIds.length === 0 || limit <= 0) return [];
  const res = await os.query.graphql<{
    standingsCurrent: StandingRecommendationEdge[];
  }>({
    query: `query DiscoverRecommendedFriendOutgoing($friends: [String!]!, $limit: Int!) {
      standingsCurrent(
        where: {accountId: {_in: $friends}},
        limit: $limit,
        orderBy: [{blockTimestamp: DESC}]
      ) {
        accountId
        targetAccount
      }
    }`,
    variables: { friends: friendIds, limit },
  });
  return res.data?.standingsCurrent ?? [];
}

async function hydrateRecommendedProfiles(
  os: OnSocial,
  viewerAccountId: string,
  accountIds: string[]
): Promise<ProfileListAccount[]> {
  if (accountIds.length === 0) return [];

  const [rows, incomingAccountIds, endorsementIssuers, endorsementTargets] =
    await Promise.all([
      os.query.profiles.statsForAccounts(accountIds),
      os.query.standings.incomingSourcesAmong(viewerAccountId, accountIds),
      os.query.endorsements.issuersAmong(viewerAccountId, accountIds),
      os.query.endorsements.targetsAmong(viewerAccountId, accountIds),
    ]);

  return discoverPageToProfileListAccounts(os, {
    profiles: orderRowsByAccountIdsCi(rows, accountIds),
    viewer: {
      outgoing: [],
      incomingAccountIds,
      endorsementIssuers,
      endorsementTargets,
    },
  });
}

/** Standing friends-of-friends for the Profiles Recommended peek. */
export async function fetchStandingRecommendations(
  os: OnSocial,
  viewerAccountId: string
): Promise<ProfileListAccount[]> {
  const viewer = viewerAccountId.trim();
  if (!viewer) return [];

  try {
    const viewerOutgoing = await os.query.standings.outgoing(viewer, {
      limit: RECOMMENDED_FRIEND_LIMIT,
    });
    if (viewerOutgoing.length < RECOMMENDED_MIN_SHARED) return [];

    const friendOutgoing = await fetchFriendOutgoingEdges(
      os,
      viewerOutgoing,
      RECOMMENDED_EDGE_LIMIT
    );
    const ranked = rankStandingRecommendations({
      viewerAccountId: viewer,
      viewerOutgoing,
      friendOutgoing,
    });
    if (ranked.length === 0) return [];

    return hydrateRecommendedProfiles(
      os,
      viewer,
      ranked.map((row) => row.accountId)
    );
  } catch {
    return [];
  }
}
