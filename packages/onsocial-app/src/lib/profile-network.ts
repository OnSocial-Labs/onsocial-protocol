import type { StanceDetailKind } from '@/lib/profile-social-standings';

export type NetworkAccountKind = 'mutual' | 'incoming' | 'outgoing';

export interface NetworkAccount {
  accountId: string;
  name: string | null;
  avatarUrl: string | null;
  kind: NetworkAccountKind;
}

export interface NetworkAccountSource {
  accountId: string;
  name: string | null;
  avatarUrl: string | null;
}

export type NetworkFilterKind = 'all' | 'mutual' | 'incoming' | 'outgoing';

export interface NetworkStandingCounts {
  incoming: number;
  outgoing: number;
  mutual: number;
}

export interface NetworkOrbitSearchMeta {
  query: string;
  matchTotal: number;
  filter: NetworkFilterKind;
}

export interface NetworkOrbitPayload {
  accountId: string;
  viewerAccountId: string | null;
  counts: NetworkStandingCounts;
  accounts: NetworkAccount[];
  search?: NetworkOrbitSearchMeta;
}

/** Orbit placement caps (must match `placeNetworkNodes` slices). */
export const NETWORK_GRAPH_RING_CAP = {
  mutual: 12,
  incoming: 12,
  outgoing: 12,
} as const;

export const NETWORK_GRAPH_MAX_MAP_NODES =
  NETWORK_GRAPH_RING_CAP.mutual +
  NETWORK_GRAPH_RING_CAP.incoming +
  NETWORK_GRAPH_RING_CAP.outgoing;

/** Rows fetched per direction for the network map sample. */
export const NETWORK_GRAPH_FETCH_LIMIT = {
  mutual: NETWORK_GRAPH_RING_CAP.mutual,
  incoming: 24,
  outgoing: 24,
} as const;

export function parseNetworkFilter(
  raw: string | null | undefined
): NetworkFilterKind {
  if (raw === 'mutual' || raw === 'incoming' || raw === 'outgoing') {
    return raw;
  }
  return 'all';
}

/**
 * Build orbit accounts: mutuals first, then one-way incoming, then one-way
 * outgoing. Lists should already be sorted newest-first from the indexer.
 */
export function buildNetworkAccountsOrdered(
  mutual: NetworkAccountSource[],
  incoming: NetworkAccountSource[],
  outgoing: NetworkAccountSource[]
): NetworkAccount[] {
  const seen = new Set<string>();
  const result: NetworkAccount[] = [];

  const push = (account: NetworkAccountSource, kind: NetworkAccountKind) => {
    if (seen.has(account.accountId)) return;
    seen.add(account.accountId);
    result.push({
      accountId: account.accountId,
      name: account.name,
      avatarUrl: account.avatarUrl,
      kind,
    });
  };

  for (const account of mutual) push(account, 'mutual');
  for (const account of incoming) push(account, 'incoming');
  for (const account of outgoing) push(account, 'outgoing');

  return result;
}

/** Unique standing peers (mutual counted once). */
export function networkUniqueConnectionTotal(
  counts: NetworkStandingCounts
): number {
  return Math.max(0, counts.incoming + counts.outgoing - counts.mutual);
}

export function networkFilterCounts(counts: NetworkStandingCounts): {
  all: number;
  mutual: number;
  incoming: number;
  outgoing: number;
} {
  return {
    all: networkUniqueConnectionTotal(counts),
    mutual: counts.mutual,
    incoming: counts.incoming,
    outgoing: counts.outgoing,
  };
}

export function networkFilterToStandKind(
  filter: NetworkFilterKind
): StanceDetailKind {
  if (filter === 'mutual') return 'mutual';
  if (filter === 'outgoing') return 'outgoing';
  return 'incoming';
}
