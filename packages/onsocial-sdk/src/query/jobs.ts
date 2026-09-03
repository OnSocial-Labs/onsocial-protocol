// ---------------------------------------------------------------------------
// Job queries — open org roles from jobs_search / jobs_current.
// Accessed as `os.query.jobs.<method>()`.
// ---------------------------------------------------------------------------

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

  async openForAccount(
    accountId: string,
    opts: { limit?: number } = {}
  ): Promise<JobSearchRow[]> {
    return this.search({
      orgAccountId: accountId,
      limit: opts.limit ?? 24,
    });
  }
}
