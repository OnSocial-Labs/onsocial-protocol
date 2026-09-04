// ---------------------------------------------------------------------------
// Job queries — open org roles from jobs_search / jobs_current.
// Accessed as `os.query.jobs.<method>()`.
// ---------------------------------------------------------------------------

import { sortAccountJobs } from '../builders/jobs.js';
import type { QueryModule } from './index.js';

const JOB_SEARCH_FIELDS = `
  orgAccountId jobId title description url ends since
  orgName orgKind orgIndustry orgAvatar searchText
  blockHeight blockTimestamp
`;

export interface JobSearchRow {
  orgAccountId: string;
  jobId: string;
  title: string;
  description: string | null;
  url: string | null;
  ends: number;
  since: number | null;
  orgName: string | null;
  orgKind: string | null;
  orgIndustry: string | null;
  orgAvatar: string | null;
  searchText?: string | null;
  blockHeight: number;
  blockTimestamp: number;
}

export interface JobSearchOptions {
  query?: string;
  industry?: string;
  orgAccountId?: string;
  limit?: number;
  offset?: number;
}

function asNumber(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function mapJobRow(row: Record<string, unknown>): JobSearchRow {
  return {
    orgAccountId: String(row.orgAccountId ?? ''),
    jobId: String(row.jobId ?? ''),
    title: String(row.title ?? ''),
    description:
      typeof row.description === 'string' && row.description.trim()
        ? row.description
        : null,
    url: typeof row.url === 'string' && row.url.trim() ? row.url : null,
    ends: asNumber(row.ends),
    since: row.since == null ? null : asNumber(row.since),
    orgName: typeof row.orgName === 'string' ? row.orgName : null,
    orgKind: typeof row.orgKind === 'string' ? row.orgKind : null,
    orgIndustry: typeof row.orgIndustry === 'string' ? row.orgIndustry : null,
    orgAvatar: typeof row.orgAvatar === 'string' ? row.orgAvatar : null,
    searchText: typeof row.searchText === 'string' ? row.searchText : null,
    blockHeight: asNumber(row.blockHeight),
    blockTimestamp: asNumber(row.blockTimestamp),
  };
}

function parseValueJson(raw: unknown): Record<string, unknown> | null {
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    return raw as Record<string, unknown>;
  }
  if (typeof raw === 'string' && raw.trim()) {
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      return null;
    }
  }
  return null;
}

function mapJobsCurrentRow(
  row: Record<string, unknown>,
  orgAccountId: string
): JobSearchRow | null {
  const jobId = String(row.jobId ?? '').trim();
  const value = parseValueJson(row.valueJson);
  if (!jobId || !value) return null;
  const title = String(value.title ?? '').trim();
  const ends = asNumber(value.ends);
  if (!title || !Number.isFinite(ends) || ends <= 0) return null;
  const description =
    typeof value.description === 'string' && value.description.trim()
      ? value.description
      : null;
  const url =
    typeof value.url === 'string' && value.url.trim() ? value.url : null;
  return {
    orgAccountId,
    jobId,
    title,
    description,
    url,
    ends,
    since: value.since == null ? null : asNumber(value.since),
    orgName: null,
    orgKind: null,
    orgIndustry: null,
    orgAvatar: null,
    searchText: null,
    blockHeight: asNumber(row.blockHeight),
    blockTimestamp: asNumber(row.blockTimestamp),
  };
}

export class JobsQuery {
  constructor(private _q: QueryModule) {}

  async search(opts: JobSearchOptions = {}): Promise<JobSearchRow[]> {
    const clauses: string[] = [];
    const decls = ['$limit: Int!', '$offset: Int!'];
    const variables: Record<string, unknown> = {
      limit: opts.limit ?? 24,
      offset: opts.offset ?? 0,
    };
    if (opts.query?.trim()) {
      decls.push('$pattern: String!');
      variables.pattern = `%${opts.query.trim()}%`;
      clauses.push('{searchText: {_ilike: $pattern}}');
    }
    if (opts.industry?.trim()) {
      decls.push('$industry: String!');
      variables.industry = opts.industry.trim();
      clauses.push('{orgIndustry: {_eq: $industry}}');
    }
    if (opts.orgAccountId?.trim()) {
      decls.push('$orgAccountId: String!');
      variables.orgAccountId = opts.orgAccountId.trim();
      clauses.push('{orgAccountId: {_eq: $orgAccountId}}');
    }
    const filter =
      clauses.length === 0
        ? ''
        : clauses.length === 1
          ? `where: ${clauses[0]}, `
          : `where: {_and: [${clauses.join(', ')}]}, `;

    const res = await this._q.graphql<{
      jobsSearch: Array<Record<string, unknown>>;
    }>({
      query: `query JobsSearch(${decls.join(', ')}) {
        jobsSearch(
          ${filter}
          limit: $limit,
          offset: $offset,
          orderBy: [{ends: ASC}, {blockHeight: DESC}]
        ) {
          ${JOB_SEARCH_FIELDS}
        }
      }`,
      variables,
    });
    return (res.data?.jobsSearch ?? []).map(mapJobRow);
  }

  /** Open roles only (`jobs_search` — closed rows are excluded in SQL). */
  async openForAccount(
    accountId: string,
    opts: { limit?: number } = {}
  ): Promise<JobSearchRow[]> {
    return this.search({
      orgAccountId: accountId,
      limit: opts.limit ?? 24,
    });
  }

  /**
   * All set jobs for an org, including closed.
   * Used by owner manage surfaces — public hiring stays on {@link openForAccount}.
   */
  async forAccount(
    accountId: string,
    opts: { limit?: number; includeClosed?: boolean } = {}
  ): Promise<JobSearchRow[]> {
    const id = accountId.trim();
    if (!id) return [];
    if (!opts.includeClosed) {
      return this.openForAccount(id, { limit: opts.limit });
    }

    const limit = opts.limit ?? 48;
    const res = await this._q.graphql<{
      jobsCurrent: Array<Record<string, unknown>>;
    }>({
      query: `query JobsForAccount($accountId: String!, $limit: Int!) {
        jobsCurrent(
          where: {
            _and: [
              {accountId: {_eq: $accountId}},
              {operation: {_eq: "set"}}
            ]
          }
          limit: $limit
          orderBy: [{blockHeight: DESC}]
        ) {
          accountId
          jobId
          valueJson
          blockHeight
          blockTimestamp
        }
      }`,
      variables: { accountId: id, limit },
    });

    const mapped = (res.data?.jobsCurrent ?? [])
      .map((row) => mapJobsCurrentRow(row, id))
      .filter((row): row is JobSearchRow => row != null);

    return sortAccountJobs(mapped) as JobSearchRow[];
  }
}
