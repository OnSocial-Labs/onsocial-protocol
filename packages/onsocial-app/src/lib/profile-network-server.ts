import type { ProfileSearchRow } from '@onsocial/sdk';
import {
  isProfileSearchQuery,
  normalizeProfileSearchQuery,
  searchMatchingAccountIds,
} from '@/lib/profile-account-search';
import {
  buildNetworkAccountsOrdered,
  centerMoodFromConfig,
  NETWORK_GRAPH_FETCH_LIMIT,
  NETWORK_GRAPH_MAX_MAP_NODES,
  parseNetworkFilter,
  rankNetworkSources,
  type NetworkAccount,
  type NetworkCenterMood,
  type NetworkFilterKind,
  type NetworkOrbitPayload,
} from '@/lib/profile-network';
import type {
  AppOnSocialClient,
  StandingListItem,
} from '@/lib/profile-social-server';

interface PeerMeta {
  name: string | null;
  avatarUrl: string | null;
}

function peerMetaFromSearchRows(
  os: AppOnSocialClient,
  rows: ProfileSearchRow[]
): Map<string, PeerMeta> {
  const meta = new Map<string, PeerMeta>();
  for (const row of rows) {
    meta.set(row.accountId, {
      name: row.name ?? null,
      avatarUrl: os.profiles.avatarUrl({
        accountId: row.accountId,
        name: row.name ?? undefined,
        bio: row.bio ?? undefined,
        avatar: row.avatar ?? undefined,
        banner: row.banner ?? undefined,
        kind: row.kind,
        extra: {},
      }),
    });
  }
  return meta;
}

function rowsToNetworkSources(
  rows: StandingListItem[],
  direction: 'mutual' | 'incoming' | 'outgoing',
  peers: Map<string, PeerMeta>
): Array<{ accountId: string; name: string | null; avatarUrl: string | null }> {
  return rows.map((row) => {
    const id = direction === 'outgoing' ? row.targetAccount : row.accountId;
    const meta = peers.get(id);
    return {
      accountId: id,
      name: meta?.name ?? null,
      avatarUrl: meta?.avatarUrl ?? null,
    };
  });
}

async function loadPeerMeta(
  os: AppOnSocialClient,
  viewerAccountId: string | null,
  accountIds: string[]
): Promise<Map<string, PeerMeta>> {
  if (accountIds.length === 0) return new Map();
  const enrichment = await os.standings.enrichPeers(
    viewerAccountId,
    accountIds
  );
  return peerMetaFromSearchRows(os, enrichment.profiles);
}

function rowPeerId(
  row: StandingListItem,
  direction: 'mutual' | 'incoming' | 'outgoing'
): string {
  return direction === 'outgoing' ? row.targetAccount : row.accountId;
}

function countUniqueSearchPeers(
  sets: Array<{
    rows: StandingListItem[];
    direction: 'mutual' | 'incoming' | 'outgoing';
  }>
): number {
  const seen = new Set<string>();
  for (const { rows, direction } of sets) {
    for (const row of rows) {
      const id = rowPeerId(row, direction);
      if (id) seen.add(id);
    }
  }
  return seen.size;
}

async function loadSearchedNetworkAccounts(
  os: AppOnSocialClient,
  accountId: string,
  viewerAccountId: string | null,
  searchQuery: string,
  filter: NetworkFilterKind
): Promise<{ accounts: NetworkAccount[]; matchTotal: number }> {
  const participants = await searchMatchingAccountIds(os, searchQuery);
  if (participants.length === 0) {
    return { accounts: [], matchTotal: 0 };
  }

  const {
    mutual: mutualLimit,
    incoming: incomingLimit,
    outgoing: outgoingLimit,
  } = NETWORK_GRAPH_FETCH_LIMIT;

  const sets: Array<{
    rows: StandingListItem[];
    direction: 'mutual' | 'incoming' | 'outgoing';
  }> = [];
  let matchTotal = 0;

  if (filter === 'mutual') {
    const [rows, total] = await Promise.all([
      os.query.standings.mutualFilteredDetailed(accountId, participants, {
        limit: NETWORK_GRAPH_MAX_MAP_NODES,
        offset: 0,
      }),
      os.query.standings.mutualFilteredCount(accountId, participants),
    ]);
    sets.push({ rows: rows as StandingListItem[], direction: 'mutual' });
    matchTotal = total;
  } else if (filter === 'incoming') {
    const [mutualRows, page] = await Promise.all([
      os.query.standings.mutualFilteredDetailed(accountId, participants, {
        limit: mutualLimit,
        offset: 0,
      }),
      os.query.standings.incomingFilteredPage(accountId, participants, {
        limit: incomingLimit,
        offset: 0,
      }),
    ]);
    sets.push(
      { rows: mutualRows as StandingListItem[], direction: 'mutual' },
      { rows: page.rows as StandingListItem[], direction: 'incoming' }
    );
    matchTotal = page.total;
  } else if (filter === 'outgoing') {
    const [mutualRows, page] = await Promise.all([
      os.query.standings.mutualFilteredDetailed(accountId, participants, {
        limit: mutualLimit,
        offset: 0,
      }),
      os.query.standings.outgoingFilteredPage(accountId, participants, {
        limit: outgoingLimit,
        offset: 0,
      }),
    ]);
    sets.push(
      { rows: mutualRows as StandingListItem[], direction: 'mutual' },
      { rows: page.rows as StandingListItem[], direction: 'outgoing' }
    );
    matchTotal = page.total;
  } else {
    const [mutualRows, incomingPage, outgoingPage] = await Promise.all([
      os.query.standings.mutualFilteredDetailed(accountId, participants, {
        limit: mutualLimit,
        offset: 0,
      }),
      os.query.standings.incomingFilteredPage(accountId, participants, {
        limit: incomingLimit,
        offset: 0,
      }),
      os.query.standings.outgoingFilteredPage(accountId, participants, {
        limit: outgoingLimit,
        offset: 0,
      }),
    ]);
    sets.push(
      { rows: mutualRows as StandingListItem[], direction: 'mutual' },
      { rows: incomingPage.rows as StandingListItem[], direction: 'incoming' },
      { rows: outgoingPage.rows as StandingListItem[], direction: 'outgoing' }
    );
    matchTotal = countUniqueSearchPeers(sets);
  }

  const accountIds = Array.from(
    new Set(
      sets.flatMap(({ rows, direction }) =>
        rows.map((row) => rowPeerId(row, direction))
      )
    )
  );
  const peers = await loadPeerMeta(os, viewerAccountId, accountIds);

  const sourcesFor = (direction: 'mutual' | 'incoming' | 'outgoing') => {
    const set = sets.find((s) => s.direction === direction);
    return set ? rowsToNetworkSources(set.rows, direction, peers) : [];
  };

  return {
    accounts: buildNetworkAccountsOrdered(
      sourcesFor('mutual'),
      sourcesFor('incoming'),
      sourcesFor('outgoing')
    ),
    matchTotal,
  };
}

/** Subject's mood accent for the center glow — null when no mood is set. */
async function loadCenterMood(
  os: AppOnSocialClient,
  accountId: string
): Promise<NetworkCenterMood | null> {
  const config = await os.query.pages.getConfig(accountId).catch(() => null);
  return centerMoodFromConfig(config);
}

/**
 * Orbit payload for `/@account/network` — the three-ring standing map.
 * Lean by design: nodes only need name + avatar, so no bio/mood/DAO
 * enrichment (unlike the standing list).
 */
export async function loadProfileNetworkOrbit(
  os: AppOnSocialClient,
  accountId: string,
  viewerAccountId: string | null,
  options: { searchQuery?: string | null; filter?: string | null } = {}
): Promise<NetworkOrbitPayload> {
  const normalizedSearch = normalizeProfileSearchQuery(options.searchQuery);
  const filter = parseNetworkFilter(options.filter);

  if (!isProfileSearchQuery(normalizedSearch)) {
    const [sample, centerMood] = await Promise.all([
      os.standings.networkSample({
        accountId,
        viewerAccountId,
        mutualLimit: NETWORK_GRAPH_FETCH_LIMIT.mutual,
        incomingLimit: NETWORK_GRAPH_FETCH_LIMIT.incoming,
        outgoingLimit: NETWORK_GRAPH_FETCH_LIMIT.outgoing,
        includeViewerKnown: true,
        includeSubjectEndorsed: true,
      }),
      loadCenterMood(os, accountId),
    ]);

    const peers = peerMetaFromSearchRows(os, sample.peers);
    const knownIds = new Set([
      ...sample.viewerKnown.mutual.map((row) => row.accountId),
      ...sample.viewerKnown.incoming.map((row) => row.accountId),
      ...sample.viewerKnown.outgoing.map((row) => row.targetAccount),
    ]);
    const endorsedIds = new Set(sample.subjectEndorsedIds);
    // Tier order per ring: connections the viewer stands with, then the
    // subject's endorsed picks, then the recency sample. Dedupe happens
    // downstream (mutual section wins over one-directional duplicates).
    const tieredSources = (
      direction: 'mutual' | 'incoming' | 'outgoing',
      rows: StandingListItem[]
    ) =>
      rankNetworkSources(rowsToNetworkSources(rows, direction, peers), {
        viewerKnownIds: knownIds,
        endorsedIds,
      });
    const accounts = buildNetworkAccountsOrdered(
      tieredSources('mutual', [
        ...(sample.viewerKnown.mutual as StandingListItem[]),
        ...(sample.subjectEndorsed.mutual as StandingListItem[]),
        ...(sample.mutual as StandingListItem[]),
      ]),
      tieredSources('incoming', [
        ...sample.viewerKnown.incoming,
        ...sample.subjectEndorsed.incoming,
        ...sample.incoming,
      ]),
      tieredSources('outgoing', [
        ...sample.viewerKnown.outgoing,
        ...sample.subjectEndorsed.outgoing,
        ...sample.outgoing,
      ])
    );
    return {
      accountId,
      viewerAccountId,
      counts: sample.counts,
      accounts,
      centerMood,
      viewerKnownCount: accounts.filter((account) =>
        knownIds.has(account.accountId)
      ).length,
      subjectEndorsedCount: accounts.filter((account) =>
        endorsedIds.has(account.accountId)
      ).length,
    };
  }

  const [countsRes, mutualCount, searched] = await Promise.all([
    os.standings.counts(accountId),
    os.standings.mutualCount(accountId),
    loadSearchedNetworkAccounts(
      os,
      accountId,
      viewerAccountId,
      normalizedSearch,
      filter
    ),
  ]);

  return {
    accountId,
    viewerAccountId,
    counts: {
      incoming: countsRes.incoming,
      outgoing: countsRes.outgoing,
      mutual: mutualCount,
    },
    accounts: searched.accounts,
    search: {
      query: normalizedSearch,
      matchTotal: searched.matchTotal,
      filter,
    },
  };
}
