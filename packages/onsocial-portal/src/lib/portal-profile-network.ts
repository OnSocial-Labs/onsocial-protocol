import type { PortalNetworkFilter } from '@/lib/portal-config';
import {
  isProfileSearchQuery,
  normalizeProfileSearchQuery,
  searchMatchingAccountIds,
} from '@/lib/profile-account-search';
import type { createPortalServerOnSocialClient } from '@/lib/onsocial-server-client';
import {
  buildNetworkAccountsOrdered,
  standingSummaryToNetworkSource,
  type NetworkAccount,
} from '@/lib/profile-network-accounts';
import {
  NETWORK_GRAPH_FETCH_LIMIT,
  NETWORK_GRAPH_MAX_MAP_NODES,
} from '@/lib/profile-network-graph';
import {
  buildStandingAccountSummaries,
  type StandingListItem,
} from '@/lib/profile-social-server';

type PortalOnSocial = ReturnType<typeof createPortalServerOnSocialClient>;

export const NETWORK_GRAPH_INCOMING_LIMIT = NETWORK_GRAPH_FETCH_LIMIT.incoming;
export const NETWORK_GRAPH_OUTGOING_LIMIT = NETWORK_GRAPH_FETCH_LIMIT.outgoing;
export const NETWORK_GRAPH_MUTUAL_LIMIT = NETWORK_GRAPH_FETCH_LIMIT.mutual;

export interface PortalProfileNetworkSearchMeta {
  query: string;
  matchTotal: number;
  filter: PortalNetworkFilter;
}

export interface PortalProfileNetworkPayload {
  accountId: string;
  viewerAccountId: string | null;
  counts: {
    incoming: number;
    outgoing: number;
    mutual: number;
  };
  accounts: NetworkAccount[];
  search?: PortalProfileNetworkSearchMeta;
}

export interface PortalProfileNetworkLoadOptions {
  searchQuery?: string | null;
  filter?: PortalNetworkFilter | string | null;
}

function parseNetworkFilter(
  filter?: PortalNetworkFilter | string | null
): PortalNetworkFilter {
  if (filter === 'mutual' || filter === 'incoming' || filter === 'outgoing') {
    return filter;
  }
  return 'all';
}

function countUniqueSearchPeers(
  mutualRows: StandingListItem[],
  incomingRows: StandingListItem[],
  outgoingRows: StandingListItem[]
): number {
  const seen = new Set<string>();
  for (const row of mutualRows) {
    if (row.accountId) seen.add(row.accountId);
  }
  for (const row of incomingRows) {
    if (row.accountId) seen.add(row.accountId);
  }
  for (const row of outgoingRows) {
    const id = row.targetAccount || row.accountId;
    if (id) seen.add(id);
  }
  return seen.size;
}

async function loadDefaultNetworkSample(
  os: PortalOnSocial,
  accountId: string,
  viewerAccountId: string | null
): Promise<NetworkAccount[]> {
  const [mutualRows, incomingRows, outgoingRows] = await Promise.all([
    os.standings.mutualList(accountId, {
      limit: NETWORK_GRAPH_MUTUAL_LIMIT,
      offset: 0,
    }),
    os.standings.listIncomingDetailed(accountId, {
      limit: NETWORK_GRAPH_INCOMING_LIMIT,
      offset: 0,
    }),
    os.standings.listOutgoingDetailed(accountId, {
      limit: NETWORK_GRAPH_OUTGOING_LIMIT,
      offset: 0,
    }),
  ]);

  const [mutual, incoming, outgoing] = await Promise.all([
    buildStandingAccountSummaries(
      os,
      mutualRows as StandingListItem[],
      'mutual',
      viewerAccountId
    ),
    buildStandingAccountSummaries(
      os,
      incomingRows as StandingListItem[],
      'incoming',
      viewerAccountId
    ),
    buildStandingAccountSummaries(
      os,
      outgoingRows as StandingListItem[],
      'outgoing',
      viewerAccountId
    ),
  ]);

  return buildNetworkAccountsOrdered(
    mutual.map(standingSummaryToNetworkSource),
    incoming.map(standingSummaryToNetworkSource),
    outgoing.map(standingSummaryToNetworkSource)
  );
}

async function loadSearchedNetworkSample(
  os: PortalOnSocial,
  accountId: string,
  viewerAccountId: string | null,
  searchQuery: string,
  filter: PortalNetworkFilter
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

  if (filter === 'mutual') {
    const [rows, matchTotal] = await Promise.all([
      os.query.standings.mutualFilteredDetailed(accountId, participants, {
        limit: NETWORK_GRAPH_MAX_MAP_NODES,
        offset: 0,
      }),
      os.query.standings.mutualFilteredCount(accountId, participants),
    ]);
    const mutual = await buildStandingAccountSummaries(
      os,
      rows as StandingListItem[],
      'mutual',
      viewerAccountId
    );
    return {
      accounts: buildNetworkAccountsOrdered(
        mutual.map(standingSummaryToNetworkSource),
        [],
        []
      ),
      matchTotal,
    };
  }

  if (filter === 'incoming') {
    const [mutualRows, incomingPage] = await Promise.all([
      os.query.standings.mutualFilteredDetailed(accountId, participants, {
        limit: mutualLimit,
        offset: 0,
      }),
      os.query.standings.incomingFilteredPage(accountId, participants, {
        limit: incomingLimit,
        offset: 0,
      }),
    ]);
    const [mutual, incoming] = await Promise.all([
      buildStandingAccountSummaries(
        os,
        mutualRows as StandingListItem[],
        'mutual',
        viewerAccountId
      ),
      buildStandingAccountSummaries(
        os,
        incomingPage.rows as StandingListItem[],
        'incoming',
        viewerAccountId
      ),
    ]);
    return {
      accounts: buildNetworkAccountsOrdered(
        mutual.map(standingSummaryToNetworkSource),
        incoming.map(standingSummaryToNetworkSource),
        []
      ),
      matchTotal: incomingPage.total,
    };
  }

  if (filter === 'outgoing') {
    const [mutualRows, outgoingPage] = await Promise.all([
      os.query.standings.mutualFilteredDetailed(accountId, participants, {
        limit: mutualLimit,
        offset: 0,
      }),
      os.query.standings.outgoingFilteredPage(accountId, participants, {
        limit: outgoingLimit,
        offset: 0,
      }),
    ]);
    const [mutual, outgoing] = await Promise.all([
      buildStandingAccountSummaries(
        os,
        mutualRows as StandingListItem[],
        'mutual',
        viewerAccountId
      ),
      buildStandingAccountSummaries(
        os,
        outgoingPage.rows as StandingListItem[],
        'outgoing',
        viewerAccountId
      ),
    ]);
    return {
      accounts: buildNetworkAccountsOrdered(
        mutual.map(standingSummaryToNetworkSource),
        [],
        outgoing.map(standingSummaryToNetworkSource)
      ),
      matchTotal: outgoingPage.total,
    };
  }

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

  const [mutual, incoming, outgoing] = await Promise.all([
    buildStandingAccountSummaries(
      os,
      mutualRows as StandingListItem[],
      'mutual',
      viewerAccountId
    ),
    buildStandingAccountSummaries(
      os,
      incomingPage.rows as StandingListItem[],
      'incoming',
      viewerAccountId
    ),
    buildStandingAccountSummaries(
      os,
      outgoingPage.rows as StandingListItem[],
      'outgoing',
      viewerAccountId
    ),
  ]);

  return {
    accounts: buildNetworkAccountsOrdered(
      mutual.map(standingSummaryToNetworkSource),
      incoming.map(standingSummaryToNetworkSource),
      outgoing.map(standingSummaryToNetworkSource)
    ),
    matchTotal: countUniqueSearchPeers(
      mutualRows as StandingListItem[],
      incomingPage.rows as StandingListItem[],
      outgoingPage.rows as StandingListItem[]
    ),
  };
}

export async function loadPortalProfileNetwork(
  os: PortalOnSocial,
  accountId: string,
  viewerAccountId: string | null,
  options: PortalProfileNetworkLoadOptions = {}
): Promise<PortalProfileNetworkPayload> {
  const [counts, mutualCount] = await Promise.all([
    os.standings.counts(accountId),
    os.query.standings.mutualCount(accountId),
  ]);

  const chainCounts = {
    incoming: counts.incoming,
    outgoing: counts.outgoing,
    mutual: mutualCount,
  };

  const normalizedSearch = normalizeProfileSearchQuery(options.searchQuery);
  const filter = parseNetworkFilter(options.filter);

  if (!isProfileSearchQuery(normalizedSearch)) {
    const accounts = await loadDefaultNetworkSample(
      os,
      accountId,
      viewerAccountId
    );
    return {
      accountId,
      viewerAccountId,
      counts: chainCounts,
      accounts,
    };
  }

  const { accounts, matchTotal } = await loadSearchedNetworkSample(
    os,
    accountId,
    viewerAccountId,
    normalizedSearch,
    filter
  );

  return {
    accountId,
    viewerAccountId,
    counts: chainCounts,
    accounts,
    search: {
      query: normalizedSearch,
      matchTotal,
      filter,
    },
  };
}
