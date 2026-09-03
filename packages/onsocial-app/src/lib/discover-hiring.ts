import type {
  JobSearchRow,
  OnSocial,
  ProfileDiscoverPageResult,
  ProfileSearchRow,
} from '@onsocial/sdk';

const HIRING_JOB_POOL_MAX = 480;

/** First-seen org order from a jobs search page. */
export function uniqueHiringOrgIds(
  jobs: readonly Pick<JobSearchRow, 'orgAccountId'>[]
): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const job of jobs) {
    const id = job.orgAccountId.trim();
    if (!id) continue;
    const key = id.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(id);
  }
  return out;
}

export function sliceHiringOrgIds(
  orgIds: readonly string[],
  offset: number,
  limit: number
): { ids: string[]; hasMore: boolean } {
  const start = Math.max(0, offset);
  const size = Math.max(0, limit);
  return {
    ids: orgIds.slice(start, start + size),
    hasMore: orgIds.length > start + size,
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

export async function fetchHiringOrgPageFromJobs(
  os: OnSocial,
  query: string,
  industry: string,
  offset: number,
  limit: number
): Promise<{ ids: string[]; hasMore: boolean }> {
  const needle = query.trim();
  const sector = industry.trim();
  const poolLimit = Math.min(
    HIRING_JOB_POOL_MAX,
    Math.max(limit * 4, offset + limit * 4)
  );
  const jobs = await os.query.jobs.search({
    ...(needle ? { query: needle } : {}),
    ...(sector ? { industry: sector } : {}),
    limit: poolLimit,
    offset: 0,
  });
  const page = sliceHiringOrgIds(uniqueHiringOrgIds(jobs), offset, limit);
  return {
    ids: page.ids,
    hasMore: page.hasMore || jobs.length === poolLimit,
  };
}

export async function loadHiringDiscoverPage(
  os: OnSocial,
  opts: {
    query: string;
    industry: string;
    viewerAccountId: string | null;
    offset: number;
    limit: number;
  }
): Promise<ProfileDiscoverPageResult & { hasMore: boolean }> {
  const { ids, hasMore } = await fetchHiringOrgPageFromJobs(
    os,
    opts.query,
    opts.industry,
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
    };
  }

  const rows = await os.query.profiles.statsForAccounts(ids);
  const profiles = orderRowsByAccountIds(rows, ids);
  const viewerAccountId = opts.viewerAccountId?.trim() || null;
  if (!viewerAccountId) {
    return { profiles, viewer: null, hasMore };
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
  };
}
