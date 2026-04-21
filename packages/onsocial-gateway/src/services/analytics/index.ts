import { config } from '../../config/index.js';

const OVERVIEW_CACHE_TTL_MS = 60_000;
const OVERVIEW_WINDOW_HOURS = 24;
const BREAKDOWN_SAMPLE_LIMIT = 200;
const DRILLDOWN_STREAM_LIMIT = 12;
export const MAX_DRILLDOWN_LIMIT = 60;
const OVERVIEW_WINDOW_NS =
  BigInt(OVERVIEW_WINDOW_HOURS) * 60n * 60n * 1_000_000_000n;

interface AggregateCountNode {
  aggregate?: {
    count?: number | null;
  } | null;
}

interface LatestNodeRow {
  blockHeight: number;
  blockTimestamp: string | number;
}

interface AccountRow {
  accountId?: string | null;
}

interface ClaimRow {
  issuer?: string | null;
}

interface GroupUpdateRow {
  author?: string | null;
  partitionId?: number | null;
}

interface PartitionedRow {
  partitionId?: number | null;
}

interface PostDetailRow {
  accountId: string;
  postId: string;
  blockHeight: number;
  blockTimestamp: string | number;
  groupId?: string | null;
}

interface ReactionDetailRow {
  accountId: string;
  path: string;
  reactionKind?: string | null;
  postOwner: string;
  blockHeight: number;
  blockTimestamp: string | number;
  operation?: string | null;
}

interface ClaimDetailRow {
  issuer: string;
  subject: string;
  claimType: string;
  claimId: string;
  blockHeight: number;
  blockTimestamp: string | number;
  operation?: string | null;
}

interface PermissionDetailRow {
  author: string;
  path: string;
  targetId?: string | null;
  partitionId?: number | null;
  blockHeight: number;
  blockTimestamp: string | number;
  operation?: string | null;
}

interface ContractDetailRow {
  author: string;
  path: string;
  targetId?: string | null;
  derivedType?: string | null;
  partitionId?: number | null;
  blockHeight: number;
  blockTimestamp: string | number;
  operation?: string | null;
}

interface GroupDetailRow {
  author: string;
  groupId?: string | null;
  path?: string | null;
  proposalType?: string | null;
  status?: string | null;
  partitionId?: number | null;
  blockHeight: number;
  blockTimestamp: string | number;
  operation?: string | null;
}

interface AnalyticsOverviewQuery {
  profilesTotal?: AggregateCountNode;
  postsTotal?: AggregateCountNode;
  reactionsTotal?: AggregateCountNode;
  claimsTotal?: AggregateCountNode;
  groupsTotal?: AggregateCountNode;
  profiles24h?: AggregateCountNode;
  posts24h?: AggregateCountNode;
  reactions24h?: AggregateCountNode;
  claims24h?: AggregateCountNode;
  groups24h?: AggregateCountNode;
  permissions24h?: AggregateCountNode;
  storage24h?: AggregateCountNode;
  contracts24h?: AggregateCountNode;
  latestPosts?: LatestNodeRow[];
  latestReactions?: LatestNodeRow[];
  latestGroups?: LatestNodeRow[];
  recentPosts?: AccountRow[];
  recentReactions?: AccountRow[];
  recentClaims?: ClaimRow[];
  recentGroups?: GroupUpdateRow[];
  recentContracts?: PartitionedRow[];
  recentPermissions?: PartitionedRow[];
}

interface AccountDrilldownQuery {
  postsTotal?: AggregateCountNode;
  reactionsTotal?: AggregateCountNode;
  claimsTotal?: AggregateCountNode;
  groupsTotal?: AggregateCountNode;
  permissionsTotal?: AggregateCountNode;
  contractsTotal?: AggregateCountNode;
  posts?: PostDetailRow[];
  reactions?: ReactionDetailRow[];
  claims?: ClaimDetailRow[];
  groups?: GroupDetailRow[];
  permissions?: PermissionDetailRow[];
  contracts?: ContractDetailRow[];
}

interface PartitionDrilldownQuery {
  groupsTotal?: AggregateCountNode;
  permissionsTotal?: AggregateCountNode;
  contractsTotal?: AggregateCountNode;
  groups?: GroupDetailRow[];
  permissions?: PermissionDetailRow[];
  contracts?: ContractDetailRow[];
}

export interface AccountActivityBreakdown {
  accountId: string;
  count: number;
}

export interface PartitionActivityBreakdown {
  partitionId: number;
  count: number;
}

export type AnalyticsStream =
  | 'posts'
  | 'reactions'
  | 'claims'
  | 'groups'
  | 'permissions'
  | 'contracts';

export type AnalyticsDrilldownStream = AnalyticsStream | 'all';

export type AnalyticsDrilldownFocus =
  | { type: 'account'; accountId: string }
  | { type: 'partition'; partitionId: number };

export interface AnalyticsDrilldownEvent {
  stream: AnalyticsStream;
  actor: string;
  blockHeight: number;
  blockTimestamp: string;
  label: string;
  detail?: string;
  operation?: string;
  partitionId?: number;
}

export interface AnalyticsDrilldown {
  generatedAt: string;
  windowHours: number;
  focus: AnalyticsDrilldownFocus;
  stream: AnalyticsDrilldownStream;
  requestedLimit: number;
  hasMore: boolean;
  totals: {
    posts: number;
    reactions: number;
    claims: number;
    groups: number;
    permissions: number;
    contracts: number;
    total: number;
  };
  latestByStream: {
    posts: LatestIndexedSummary | null;
    reactions: LatestIndexedSummary | null;
    claims: LatestIndexedSummary | null;
    groups: LatestIndexedSummary | null;
    permissions: LatestIndexedSummary | null;
    contracts: LatestIndexedSummary | null;
  };
  recent: AnalyticsDrilldownEvent[];
}

export interface AnalyticsOverview {
  generatedAt: string;
  windowHours: number;
  sampleLimit: number;
  totals: {
    profiles: number;
    posts: number;
    reactions: number;
    claims: number;
    groups: number;
  };
  recent24h: {
    profiles: number;
    posts: number;
    reactions: number;
    claims: number;
    groups: number;
    permissionChanges: number;
    storageWrites: number;
    contractEvents: number;
  };
  latestIndexed: {
    posts: LatestIndexedSummary | null;
    reactions: LatestIndexedSummary | null;
    groups: LatestIndexedSummary | null;
  };
  breakdowns: {
    topPostAuthors: AccountActivityBreakdown[];
    topReactionAuthors: AccountActivityBreakdown[];
    topClaimIssuers: AccountActivityBreakdown[];
    topGroupAuthors: AccountActivityBreakdown[];
    topPartitions: PartitionActivityBreakdown[];
  };
}

interface LatestIndexedSummary {
  blockHeight: number;
  blockTimestamp: string;
}

let cachedOverview: {
  expiresAt: number;
  data: AnalyticsOverview;
} | null = null;

function countOf(node?: AggregateCountNode): number {
  return node?.aggregate?.count ?? 0;
}

function toLatest(rows?: LatestNodeRow[]): LatestIndexedSummary | null {
  const row = rows?.[0];
  if (!row) return null;

  return {
    blockHeight: row.blockHeight,
    blockTimestamp: String(row.blockTimestamp),
  };
}

function toTopAccounts<T>(
  rows: T[] | undefined,
  getAccountId: (row: T) => string | null | undefined,
  limit = 5
): AccountActivityBreakdown[] {
  const counts = new Map<string, number>();

  for (const row of rows ?? []) {
    const accountId = getAccountId(row)?.trim();
    if (!accountId) continue;
    counts.set(accountId, (counts.get(accountId) ?? 0) + 1);
  }

  return [...counts.entries()]
    .sort(
      (left, right) => right[1] - left[1] || left[0].localeCompare(right[0])
    )
    .slice(0, limit)
    .map(([accountId, count]) => ({ accountId, count }));
}

function toTopPartitions(
  groups: GroupUpdateRow[] | undefined,
  contracts: PartitionedRow[] | undefined,
  permissions: PartitionedRow[] | undefined,
  limit = 5
): PartitionActivityBreakdown[] {
  const counts = new Map<number, number>();

  for (const row of [
    ...(groups ?? []),
    ...(contracts ?? []),
    ...(permissions ?? []),
  ]) {
    const partitionId = row.partitionId;
    if (partitionId == null) continue;
    counts.set(partitionId, (counts.get(partitionId) ?? 0) + 1);
  }

  return [...counts.entries()]
    .sort((left, right) => right[1] - left[1] || left[0] - right[0])
    .slice(0, limit)
    .map(([partitionId, count]) => ({ partitionId, count }));
}

function toTimestampString(value: string | number): string {
  return String(value);
}

function toEventSummary(
  stream: AnalyticsStream,
  row:
    | PostDetailRow
    | ReactionDetailRow
    | ClaimDetailRow
    | GroupDetailRow
    | PermissionDetailRow
    | ContractDetailRow
): AnalyticsDrilldownEvent {
  switch (stream) {
    case 'posts': {
      const post = row as PostDetailRow;
      return {
        stream,
        actor: post.accountId,
        blockHeight: post.blockHeight,
        blockTimestamp: toTimestampString(post.blockTimestamp),
        label: `post/${post.postId}`,
        detail: post.groupId ? `group ${post.groupId}` : undefined,
      };
    }
    case 'reactions': {
      const reaction = row as ReactionDetailRow;
      return {
        stream,
        actor: reaction.accountId,
        blockHeight: reaction.blockHeight,
        blockTimestamp: toTimestampString(reaction.blockTimestamp),
        label: reaction.reactionKind ?? reaction.path,
        detail: `owner ${reaction.postOwner}`,
        operation: reaction.operation ?? undefined,
      };
    }
    case 'claims': {
      const claim = row as ClaimDetailRow;
      return {
        stream,
        actor: claim.issuer,
        blockHeight: claim.blockHeight,
        blockTimestamp: toTimestampString(claim.blockTimestamp),
        label: `${claim.claimType}/${claim.claimId}`,
        detail: `subject ${claim.subject}`,
        operation: claim.operation ?? undefined,
      };
    }
    case 'groups': {
      const group = row as GroupDetailRow;
      return {
        stream,
        actor: group.author,
        blockHeight: group.blockHeight,
        blockTimestamp: toTimestampString(group.blockTimestamp),
        label: group.groupId
          ? `group/${group.groupId}`
          : (group.path ?? 'group update'),
        detail: group.proposalType || group.status || group.path || undefined,
        operation: group.operation ?? undefined,
        partitionId: group.partitionId ?? undefined,
      };
    }
    case 'permissions': {
      const permission = row as PermissionDetailRow;
      return {
        stream,
        actor: permission.author,
        blockHeight: permission.blockHeight,
        blockTimestamp: toTimestampString(permission.blockTimestamp),
        label: permission.path,
        detail: permission.targetId ?? undefined,
        operation: permission.operation ?? undefined,
        partitionId: permission.partitionId ?? undefined,
      };
    }
    case 'contracts': {
      const contract = row as ContractDetailRow;
      return {
        stream,
        actor: contract.author,
        blockHeight: contract.blockHeight,
        blockTimestamp: toTimestampString(contract.blockTimestamp),
        label: contract.path,
        detail: contract.targetId || contract.derivedType || undefined,
        operation: contract.operation ?? undefined,
        partitionId: contract.partitionId ?? undefined,
      };
    }
  }
}

function buildRecentEvents(
  streams: Array<{
    stream: AnalyticsStream;
    rows?: Array<
      | PostDetailRow
      | ReactionDetailRow
      | ClaimDetailRow
      | GroupDetailRow
      | PermissionDetailRow
      | ContractDetailRow
    >;
  }>,
  limit: number
): AnalyticsDrilldownEvent[] {
  return streams
    .flatMap(({ stream, rows }) =>
      (rows ?? []).map((row) => toEventSummary(stream, row))
    )
    .sort((left, right) => right.blockHeight - left.blockHeight)
    .slice(0, limit);
}

function filterTotalsByStream(
  totals: AnalyticsDrilldown['totals'],
  stream: AnalyticsDrilldownStream
): AnalyticsDrilldown['totals'] {
  if (stream === 'all') {
    return totals;
  }

  return {
    posts: stream === 'posts' ? totals.posts : 0,
    reactions: stream === 'reactions' ? totals.reactions : 0,
    claims: stream === 'claims' ? totals.claims : 0,
    groups: stream === 'groups' ? totals.groups : 0,
    permissions: stream === 'permissions' ? totals.permissions : 0,
    contracts: stream === 'contracts' ? totals.contracts : 0,
    total: totals[stream],
  };
}

function filterLatestByStream(
  latestByStream: AnalyticsDrilldown['latestByStream'],
  stream: AnalyticsDrilldownStream
): AnalyticsDrilldown['latestByStream'] {
  if (stream === 'all') {
    return latestByStream;
  }

  return {
    posts: stream === 'posts' ? latestByStream.posts : null,
    reactions: stream === 'reactions' ? latestByStream.reactions : null,
    claims: stream === 'claims' ? latestByStream.claims : null,
    groups: stream === 'groups' ? latestByStream.groups : null,
    permissions: stream === 'permissions' ? latestByStream.permissions : null,
    contracts: stream === 'contracts' ? latestByStream.contracts : null,
  };
}

function filterRecentByStream(
  recent: AnalyticsDrilldownEvent[],
  stream: AnalyticsDrilldownStream
): AnalyticsDrilldownEvent[] {
  if (stream === 'all') {
    return recent;
  }

  return recent.filter((event) => event.stream === stream);
}

function buildOverviewQuery(sinceNs: string): string {
  return `query AnalyticsOverview {
    profilesTotal: profilesCurrentAggregate(where: {value: {_isNull: false}}) {
      aggregate {
        count(columns: [accountId], distinct: true)
      }
    }
    postsTotal: postsCurrentAggregate {
      aggregate {
        count
      }
    }
    reactionsTotal: reactionsCurrentAggregate {
      aggregate {
        count
      }
    }
    claimsTotal: claimsCurrentAggregate {
      aggregate {
        count
      }
    }
    groupsTotal: groupUpdatesAggregate(where: {value: {_isNull: false}}) {
      aggregate {
        count(columns: [groupId], distinct: true)
      }
    }
    profiles24h: profilesCurrentAggregate(where: {value: {_isNull: false}, blockTimestamp: {_gte: "${sinceNs}"}}) {
      aggregate {
        count(columns: [accountId], distinct: true)
      }
    }
    posts24h: postsCurrentAggregate(where: {blockTimestamp: {_gte: "${sinceNs}"}}) {
      aggregate {
        count
      }
    }
    reactions24h: reactionsCurrentAggregate(where: {blockTimestamp: {_gte: "${sinceNs}"}}) {
      aggregate {
        count
      }
    }
    claims24h: claimsCurrentAggregate(where: {blockTimestamp: {_gte: "${sinceNs}"}}) {
      aggregate {
        count
      }
    }
    groups24h: groupUpdatesAggregate(where: {value: {_isNull: false}, blockTimestamp: {_gte: "${sinceNs}"}}) {
      aggregate {
        count(columns: [groupId], distinct: true)
      }
    }
    permissions24h: permissionUpdatesAggregate(where: {blockTimestamp: {_gte: "${sinceNs}"}}) {
      aggregate {
        count
      }
    }
    storage24h: storageUpdatesAggregate(where: {blockTimestamp: {_gte: "${sinceNs}"}}) {
      aggregate {
        count
      }
    }
    contracts24h: contractUpdatesAggregate(where: {blockTimestamp: {_gte: "${sinceNs}"}}) {
      aggregate {
        count
      }
    }
    latestPosts: postsCurrent(limit: 1, orderBy: [{blockHeight: DESC}]) {
      blockHeight
      blockTimestamp
    }
    latestReactions: reactionsCurrent(limit: 1, orderBy: [{blockHeight: DESC}]) {
      blockHeight
      blockTimestamp
    }
    latestGroups: groupUpdates(limit: 1, orderBy: [{blockHeight: DESC}]) {
      blockHeight
      blockTimestamp
    }
    recentPosts: postsCurrent(
      where: {blockTimestamp: {_gte: "${sinceNs}"}},
      limit: ${BREAKDOWN_SAMPLE_LIMIT},
      orderBy: [{blockHeight: DESC}]
    ) {
      accountId
    }
    recentReactions: reactionsCurrent(
      where: {blockTimestamp: {_gte: "${sinceNs}"}},
      limit: ${BREAKDOWN_SAMPLE_LIMIT},
      orderBy: [{blockHeight: DESC}]
    ) {
      accountId
    }
    recentClaims: claimsCurrent(
      where: {blockTimestamp: {_gte: "${sinceNs}"}},
      limit: ${BREAKDOWN_SAMPLE_LIMIT},
      orderBy: [{blockHeight: DESC}]
    ) {
      issuer
    }
    recentGroups: groupUpdates(
      where: {blockTimestamp: {_gte: "${sinceNs}"}},
      limit: ${BREAKDOWN_SAMPLE_LIMIT},
      orderBy: [{blockHeight: DESC}]
    ) {
      author
      partitionId
    }
    recentContracts: contractUpdates(
      where: {blockTimestamp: {_gte: "${sinceNs}"}},
      limit: ${BREAKDOWN_SAMPLE_LIMIT},
      orderBy: [{blockHeight: DESC}]
    ) {
      partitionId
    }
    recentPermissions: permissionUpdates(
      where: {blockTimestamp: {_gte: "${sinceNs}"}},
      limit: ${BREAKDOWN_SAMPLE_LIMIT},
      orderBy: [{blockHeight: DESC}]
    ) {
      partitionId
    }
  }`;
}

async function queryAnalyticsOverview(
  viewerAccountId: string,
  query: string
): Promise<AnalyticsOverviewQuery> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'x-hasura-role': 'service',
    'x-hasura-user-id': viewerAccountId,
  };

  if (config.hasuraAdminSecret) {
    headers['x-hasura-admin-secret'] = config.hasuraAdminSecret;
  }

  const response = await fetch(config.hasuraUrl, {
    method: 'POST',
    headers,
    signal: AbortSignal.timeout(10_000),
    body: JSON.stringify({ query }),
  });

  if (!response.ok) {
    throw new Error(`Hasura returned ${response.status}`);
  }

  const body = (await response.json()) as {
    data?: AnalyticsOverviewQuery;
    errors?: Array<{ message?: string }>;
  };

  if (body.errors?.length) {
    throw new Error(
      body.errors.map((error) => error.message ?? 'Unknown error').join('; ')
    );
  }

  if (!body.data) {
    throw new Error('Hasura returned no data');
  }

  return body.data;
}

async function queryAnalyticsDetail<T>(
  viewerAccountId: string,
  query: string
): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'x-hasura-role': 'service',
    'x-hasura-user-id': viewerAccountId,
  };

  if (config.hasuraAdminSecret) {
    headers['x-hasura-admin-secret'] = config.hasuraAdminSecret;
  }

  const response = await fetch(config.hasuraUrl, {
    method: 'POST',
    headers,
    signal: AbortSignal.timeout(10_000),
    body: JSON.stringify({ query }),
  });

  if (!response.ok) {
    throw new Error(`Hasura returned ${response.status}`);
  }

  const body = (await response.json()) as {
    data?: T;
    errors?: Array<{ message?: string }>;
  };

  if (body.errors?.length) {
    throw new Error(
      body.errors.map((error) => error.message ?? 'Unknown error').join('; ')
    );
  }

  if (!body.data) {
    throw new Error('Hasura returned no data');
  }

  return body.data;
}

function buildAccountDrilldownQuery(accountId: string, limit: number): string {
  return `query AnalyticsAccountDrilldown {
    postsTotal: postsCurrentAggregate(where: {accountId: {_eq: "${accountId}"}}) { aggregate { count } }
    reactionsTotal: reactionsCurrentAggregate(where: {accountId: {_eq: "${accountId}"}}) { aggregate { count } }
    claimsTotal: claimsCurrentAggregate(where: {issuer: {_eq: "${accountId}"}}) { aggregate { count } }
    groupsTotal: groupUpdatesAggregate(where: {author: {_eq: "${accountId}"}}) { aggregate { count } }
    permissionsTotal: permissionUpdatesAggregate(where: {author: {_eq: "${accountId}"}}) { aggregate { count } }
    contractsTotal: contractUpdatesAggregate(where: {author: {_eq: "${accountId}"}}) { aggregate { count } }
    posts: postsCurrent(where: {accountId: {_eq: "${accountId}"}}, limit: ${limit}, orderBy: [{blockHeight: DESC}]) {
      accountId postId blockHeight blockTimestamp groupId
    }
    reactions: reactionsCurrent(where: {accountId: {_eq: "${accountId}"}}, limit: ${limit}, orderBy: [{blockHeight: DESC}]) {
      accountId path reactionKind postOwner blockHeight blockTimestamp operation
    }
    claims: claimsCurrent(where: {issuer: {_eq: "${accountId}"}}, limit: ${limit}, orderBy: [{blockHeight: DESC}]) {
      issuer subject claimType claimId blockHeight blockTimestamp operation
    }
    groups: groupUpdates(where: {author: {_eq: "${accountId}"}}, limit: ${limit}, orderBy: [{blockHeight: DESC}]) {
      author groupId path proposalType status partitionId blockHeight blockTimestamp operation
    }
    permissions: permissionUpdates(where: {author: {_eq: "${accountId}"}}, limit: ${limit}, orderBy: [{blockHeight: DESC}]) {
      author path targetId partitionId blockHeight blockTimestamp operation
    }
    contracts: contractUpdates(where: {author: {_eq: "${accountId}"}}, limit: ${limit}, orderBy: [{blockHeight: DESC}]) {
      author path targetId derivedType partitionId blockHeight blockTimestamp operation
    }
  }`;
}

function buildPartitionDrilldownQuery(
  partitionId: number,
  limit: number
): string {
  return `query AnalyticsPartitionDrilldown {
    groupsTotal: groupUpdatesAggregate(where: {partitionId: {_eq: ${partitionId}}}) { aggregate { count } }
    permissionsTotal: permissionUpdatesAggregate(where: {partitionId: {_eq: ${partitionId}}}) { aggregate { count } }
    contractsTotal: contractUpdatesAggregate(where: {partitionId: {_eq: ${partitionId}}}) { aggregate { count } }
    groups: groupUpdates(where: {partitionId: {_eq: ${partitionId}}}, limit: ${limit}, orderBy: [{blockHeight: DESC}]) {
      author groupId path proposalType status partitionId blockHeight blockTimestamp operation
    }
    permissions: permissionUpdates(where: {partitionId: {_eq: ${partitionId}}}, limit: ${limit}, orderBy: [{blockHeight: DESC}]) {
      author path targetId partitionId blockHeight blockTimestamp operation
    }
    contracts: contractUpdates(where: {partitionId: {_eq: ${partitionId}}}, limit: ${limit}, orderBy: [{blockHeight: DESC}]) {
      author path targetId derivedType partitionId blockHeight blockTimestamp operation
    }
  }`;
}

function hasMoreForStream(
  totals: AnalyticsDrilldown['totals'],
  stream: AnalyticsDrilldownStream,
  recentCount: number
): boolean {
  const total = stream === 'all' ? totals.total : totals[stream];
  return total > recentCount;
}

export async function getAnalyticsOverview(
  viewerAccountId: string
): Promise<AnalyticsOverview> {
  if (cachedOverview && cachedOverview.expiresAt > Date.now()) {
    return cachedOverview.data;
  }

  const sinceNs = String(BigInt(Date.now()) * 1_000_000n - OVERVIEW_WINDOW_NS);
  const data = await queryAnalyticsOverview(
    viewerAccountId,
    buildOverviewQuery(sinceNs)
  );

  const overview: AnalyticsOverview = {
    generatedAt: new Date().toISOString(),
    windowHours: OVERVIEW_WINDOW_HOURS,
    sampleLimit: BREAKDOWN_SAMPLE_LIMIT,
    totals: {
      profiles: countOf(data.profilesTotal),
      posts: countOf(data.postsTotal),
      reactions: countOf(data.reactionsTotal),
      claims: countOf(data.claimsTotal),
      groups: countOf(data.groupsTotal),
    },
    recent24h: {
      profiles: countOf(data.profiles24h),
      posts: countOf(data.posts24h),
      reactions: countOf(data.reactions24h),
      claims: countOf(data.claims24h),
      groups: countOf(data.groups24h),
      permissionChanges: countOf(data.permissions24h),
      storageWrites: countOf(data.storage24h),
      contractEvents: countOf(data.contracts24h),
    },
    latestIndexed: {
      posts: toLatest(data.latestPosts),
      reactions: toLatest(data.latestReactions),
      groups: toLatest(data.latestGroups),
    },
    breakdowns: {
      topPostAuthors: toTopAccounts(data.recentPosts, (row) => row.accountId),
      topReactionAuthors: toTopAccounts(
        data.recentReactions,
        (row) => row.accountId
      ),
      topClaimIssuers: toTopAccounts(data.recentClaims, (row) => row.issuer),
      topGroupAuthors: toTopAccounts(data.recentGroups, (row) => row.author),
      topPartitions: toTopPartitions(
        data.recentGroups,
        data.recentContracts,
        data.recentPermissions
      ),
    },
  };

  cachedOverview = {
    data: overview,
    expiresAt: Date.now() + OVERVIEW_CACHE_TTL_MS,
  };

  return overview;
}

export async function getAnalyticsDrilldown(
  viewerAccountId: string,
  focus: AnalyticsDrilldownFocus,
  stream: AnalyticsDrilldownStream = 'all',
  limit = DRILLDOWN_STREAM_LIMIT
): Promise<AnalyticsDrilldown> {
  const generatedAt = new Date().toISOString();
  const requestedLimit = Math.max(1, Math.min(limit, MAX_DRILLDOWN_LIMIT));

  if (focus.type === 'account') {
    const data = await queryAnalyticsDetail<AccountDrilldownQuery>(
      viewerAccountId,
      buildAccountDrilldownQuery(focus.accountId, requestedLimit)
    );

    const totals = {
      posts: countOf(data.postsTotal),
      reactions: countOf(data.reactionsTotal),
      claims: countOf(data.claimsTotal),
      groups: countOf(data.groupsTotal),
      permissions: countOf(data.permissionsTotal),
      contracts: countOf(data.contractsTotal),
      total:
        countOf(data.postsTotal) +
        countOf(data.reactionsTotal) +
        countOf(data.claimsTotal) +
        countOf(data.groupsTotal) +
        countOf(data.permissionsTotal) +
        countOf(data.contractsTotal),
    };

    const unfiltered: AnalyticsDrilldown = {
      generatedAt,
      windowHours: OVERVIEW_WINDOW_HOURS,
      focus,
      stream,
      requestedLimit,
      hasMore: false,
      totals,
      latestByStream: {
        posts: toLatest(data.posts),
        reactions: toLatest(data.reactions),
        claims: toLatest(data.claims),
        groups: toLatest(data.groups),
        permissions: toLatest(data.permissions),
        contracts: toLatest(data.contracts),
      },
      recent: buildRecentEvents(
        [
          { stream: 'posts', rows: data.posts },
          { stream: 'reactions', rows: data.reactions },
          { stream: 'claims', rows: data.claims },
          { stream: 'groups', rows: data.groups },
          { stream: 'permissions', rows: data.permissions },
          { stream: 'contracts', rows: data.contracts },
        ],
        requestedLimit
      ),
    };

    const recent = filterRecentByStream(unfiltered.recent, stream);
    const filteredTotals = filterTotalsByStream(unfiltered.totals, stream);

    return {
      ...unfiltered,
      totals: filteredTotals,
      latestByStream: filterLatestByStream(unfiltered.latestByStream, stream),
      recent,
      hasMore: hasMoreForStream(filteredTotals, stream, recent.length),
    };
  }

  const data = await queryAnalyticsDetail<PartitionDrilldownQuery>(
    viewerAccountId,
    buildPartitionDrilldownQuery(focus.partitionId, requestedLimit)
  );

  const totals = {
    posts: 0,
    reactions: 0,
    claims: 0,
    groups: countOf(data.groupsTotal),
    permissions: countOf(data.permissionsTotal),
    contracts: countOf(data.contractsTotal),
    total:
      countOf(data.groupsTotal) +
      countOf(data.permissionsTotal) +
      countOf(data.contractsTotal),
  };

  const unfiltered: AnalyticsDrilldown = {
    generatedAt,
    windowHours: OVERVIEW_WINDOW_HOURS,
    focus,
    stream,
    requestedLimit,
    hasMore: false,
    totals,
    latestByStream: {
      posts: null,
      reactions: null,
      claims: null,
      groups: toLatest(data.groups),
      permissions: toLatest(data.permissions),
      contracts: toLatest(data.contracts),
    },
    recent: buildRecentEvents(
      [
        { stream: 'groups', rows: data.groups },
        { stream: 'permissions', rows: data.permissions },
        { stream: 'contracts', rows: data.contracts },
      ],
      requestedLimit
    ),
  };

  const recent = filterRecentByStream(unfiltered.recent, stream);
  const filteredTotals = filterTotalsByStream(unfiltered.totals, stream);

  return {
    ...unfiltered,
    totals: filteredTotals,
    latestByStream: filterLatestByStream(unfiltered.latestByStream, stream),
    recent,
    hasMore: hasMoreForStream(filteredTotals, stream, recent.length),
  };
}
