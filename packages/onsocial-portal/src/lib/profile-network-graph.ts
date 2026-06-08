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

export interface NetworkStandingCounts {
  incoming: number;
  outgoing: number;
  mutual: number;
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
  filter: 'all' | 'mutual' | 'incoming' | 'outgoing'
): 'incoming' | 'outgoing' | 'mutual' {
  if (filter === 'mutual') return 'mutual';
  if (filter === 'outgoing') return 'outgoing';
  return 'incoming';
}
