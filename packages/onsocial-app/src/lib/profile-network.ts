import type { PublicPageConfig } from '@/lib/page-data';
import { parsePageMoodRecord, resolvePortfolioMood } from '@/lib/moods/resolve';
import type { StanceDetailKind } from '@/lib/profile-social-standings';

export type NetworkAccountKind = 'mutual' | 'incoming' | 'outgoing';

export interface NetworkAccount {
  accountId: string;
  name: string | null;
  avatarUrl: string | null;
  kind: NetworkAccountKind;
  /** The map subject gave this account an endorsement. */
  endorsed?: boolean;
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

/** Subject's chosen mood accent for the orbit center glow. */
export interface NetworkCenterMood {
  accent: string;
  accentLight: string;
}

export interface NetworkOrbitPayload {
  accountId: string;
  viewerAccountId: string | null;
  counts: NetworkStandingCounts;
  accounts: NetworkAccount[];
  /** Only on full (non-search) loads — the center does not change mid-search. */
  centerMood?: NetworkCenterMood | null;
  /**
   * Unique shown accounts the logged-in viewer also stands with. Only on
   * full loads; 0/absent means the map is pure recency order.
   */
  viewerKnownCount?: number;
  /**
   * Unique shown accounts the subject endorses. Only on full loads;
   * 0/absent means no endorsed connections are on the map.
   */
  subjectEndorsedCount?: number;
  search?: NetworkOrbitSearchMeta;
}

/**
 * Center-glow rule: the subject's own mood accent when they picked a
 * non-default mood; null otherwise so the orbit falls back to the stable
 * per-account identity hue (keeps variety across mood-less profiles).
 */
export function centerMoodFromConfig(
  config: PublicPageConfig | null | undefined
): NetworkCenterMood | null {
  if (!config || !parsePageMoodRecord(config)) return null;
  const mood = resolvePortfolioMood(config);
  if (mood.id === 'protocol') return null;
  const accent = mood.cssVars['--mood-preset-accent'];
  if (!accent) return null;
  return {
    accent,
    accentLight: mood.cssVars['--mood-preset-accent-light'] ?? accent,
  };
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
 * Stable tier order within one direction's candidate list: accounts the
 * viewer stands with first, then accounts the subject endorses, then the
 * recency sample. Dedupes by account (first occurrence wins) so callers can
 * concatenate tier lists and the recency sample without pre-filtering.
 */
export function rankNetworkSources(
  sources: NetworkAccountSource[],
  tiers: {
    viewerKnownIds: ReadonlySet<string>;
    endorsedIds: ReadonlySet<string>;
  }
): NetworkAccountSource[] {
  const seen = new Set<string>();
  const known: NetworkAccountSource[] = [];
  const endorsed: NetworkAccountSource[] = [];
  const rest: NetworkAccountSource[] = [];
  for (const source of sources) {
    if (seen.has(source.accountId)) continue;
    seen.add(source.accountId);
    if (tiers.viewerKnownIds.has(source.accountId)) known.push(source);
    else if (tiers.endorsedIds.has(source.accountId)) endorsed.push(source);
    else rest.push(source);
  }
  return [...known, ...endorsed, ...rest];
}

/** Flag accounts the subject endorses — drives the gold vouch pip on nodes. */
export function markEndorsedAccounts(
  accounts: NetworkAccount[],
  endorsedIds: ReadonlySet<string>
): NetworkAccount[] {
  if (endorsedIds.size === 0) return accounts;
  return accounts.map((account) =>
    endorsedIds.has(account.accountId)
      ? { ...account, endorsed: true }
      : account
  );
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
