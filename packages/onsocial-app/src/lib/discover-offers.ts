import type {
  OfferSearchRow,
  OnSocial,
  ProfileDiscoverPageResult,
  ProfileSearchRow,
} from '@onsocial/sdk';
import { leadTitleByAccount } from '@/lib/discover-face-line';

const OFFER_POOL_MAX = 480;

/** First-seen account order from an offers search page. */
export function uniqueOfferAccountIds(
  offers: readonly Pick<OfferSearchRow, 'accountId'>[]
): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const offer of offers) {
    const id = offer.accountId.trim();
    if (!id) continue;
    const key = id.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(id);
  }
  return out;
}

export function sliceOfferAccountIds(
  accountIds: readonly string[],
  offset: number,
  limit: number
): { ids: string[]; hasMore: boolean } {
  const start = Math.max(0, offset);
  const size = Math.max(0, limit);
  return {
    ids: accountIds.slice(start, start + size),
    hasMore: accountIds.length > start + size,
  };
}

function orderRowsByAccountIds(
  rows: ProfileSearchRow[],
  ids: string[]
): ProfileSearchRow[] {
  const byId = new Map(
    rows.map((row) => [row.accountId.trim().toLowerCase(), row])
  );
  const out: ProfileSearchRow[] = [];
  for (const id of ids) {
    const row = byId.get(id.trim().toLowerCase());
    if (row) out.push(row);
  }
  return out;
}

export async function fetchOfferAccountPage(
  os: OnSocial,
  query: string,
  offset: number,
  limit: number
): Promise<{
  ids: string[];
  hasMore: boolean;
  leadTitles: Record<string, string>;
}> {
  const needle = query.trim();
  const poolLimit = Math.min(
    OFFER_POOL_MAX,
    Math.max(limit * 4, offset + limit * 4)
  );
  const offers = await os.query.offers.search({
    ...(needle ? { query: needle } : {}),
    limit: poolLimit,
    offset: 0,
  });
  const page = sliceOfferAccountIds(
    uniqueOfferAccountIds(offers),
    offset,
    limit
  );
  return {
    ids: page.ids,
    hasMore: page.hasMore || offers.length === poolLimit,
    leadTitles: leadTitleByAccount(offers),
  };
}

export async function loadOffersDiscoverPage(
  os: OnSocial,
  opts: {
    query: string;
    viewerAccountId: string | null;
    offset: number;
    limit: number;
  }
): Promise<
  ProfileDiscoverPageResult & {
    hasMore: boolean;
    leadTitles: Record<string, string>;
  }
> {
  const { ids, hasMore, leadTitles } = await fetchOfferAccountPage(
    os,
    opts.query,
    opts.offset,
    opts.limit
  );
  const emptyViewer = {
    outgoing: [],
    incomingAccountIds: [],
    endorsementIssuers: [],
    endorsementTargets: [],
  };

  if (ids.length === 0) {
    return {
      profiles: [],
      viewer: opts.viewerAccountId ? emptyViewer : null,
      hasMore: false,
      leadTitles,
    };
  }

  const rows = await os.query.profiles.statsForAccounts(ids);
  const profiles = orderRowsByAccountIds(rows, ids);
  const viewerAccountId = opts.viewerAccountId?.trim() || null;
  if (!viewerAccountId) {
    return { profiles, viewer: null, hasMore, leadTitles };
  }

  const [outgoing, incomingAccountIds, endorsementIssuers, endorsementTargets] =
    await Promise.all([
      os.query.standings.outgoingTargetsAmong(viewerAccountId, ids),
      os.query.standings.incomingSourcesAmong(viewerAccountId, ids),
      os.query.endorsements.issuersAmong(viewerAccountId, ids),
      os.query.endorsements.targetsAmong(viewerAccountId, ids),
    ]);

  return {
    profiles,
    viewer: {
      outgoing: outgoing.map((row) => ({
        accountId: row.accountId,
        targetAccount: row.targetAccount,
        since: row.since,
        blockTimestamp: row.blockTimestamp,
      })),
      incomingAccountIds,
      endorsementIssuers,
      endorsementTargets,
    },
    hasMore,
    leadTitles,
  };
}
