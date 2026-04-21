import { ACTIVE_API_URL } from '@/lib/portal-config';

const GATEWAY_BASE = ACTIVE_API_URL.replace(/\/$/, '');

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

export interface LatestIndexedSummary {
  blockHeight: number;
  blockTimestamp: string;
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
  stream:
    | 'posts'
    | 'reactions'
    | 'claims'
    | 'groups'
    | 'permissions'
    | 'contracts';
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

export async function fetchAnalyticsOverview(
  jwt: string
): Promise<AnalyticsOverview> {
  const res = await fetch(`${GATEWAY_BASE}/developer/analytics/overview`, {
    headers: {
      Authorization: `Bearer ${jwt}`,
    },
    cache: 'no-store',
  });

  const body = (await res.json().catch(() => ({}))) as {
    error?: string;
  };

  if (!res.ok) {
    throw new Error(body.error ?? `Request failed (${res.status})`);
  }

  return body as AnalyticsOverview;
}

export async function fetchAnalyticsDrilldown(
  jwt: string,
  focus: AnalyticsDrilldownFocus,
  stream: AnalyticsDrilldownStream = 'all',
  limit = 12
): Promise<AnalyticsDrilldown> {
  const params = new URLSearchParams(
    focus.type === 'account'
      ? { accountId: focus.accountId }
      : { partitionId: String(focus.partitionId) }
  );
  params.set('stream', stream);
  params.set('limit', String(limit));

  const res = await fetch(
    `${GATEWAY_BASE}/developer/analytics/drilldown?${params.toString()}`,
    {
      headers: {
        Authorization: `Bearer ${jwt}`,
      },
      cache: 'no-store',
    }
  );

  const body = (await res.json().catch(() => ({}))) as {
    error?: string;
  };

  if (!res.ok) {
    throw new Error(body.error ?? `Request failed (${res.status})`);
  }

  return body as AnalyticsDrilldown;
}