// ---------------------------------------------------------------------------
// Offer queries — standing services from offers_search.
// Accessed as `os.query.offers.<method>()`.
// ---------------------------------------------------------------------------

import type { QueryModule } from './index.js';

const OFFER_SEARCH_FIELDS = `
  accountId offerId title line url since
  profileName profileKind profileIndustry profileAvatar searchText
  blockHeight blockTimestamp
`;

export interface OfferSearchRow {
  accountId: string;
  offerId: string;
  title: string;
  line: string | null;
  url: string | null;
  since: number | null;
  profileName: string | null;
  profileKind: string | null;
  profileIndustry: string | null;
  profileAvatar: string | null;
  searchText?: string | null;
  blockHeight: number;
  blockTimestamp: number;
}

export interface OfferSearchOptions {
  query?: string;
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

function mapOfferRow(row: Record<string, unknown>): OfferSearchRow {
  return {
    accountId: String(row.accountId ?? ''),
    offerId: String(row.offerId ?? ''),
    title: String(row.title ?? ''),
    line: typeof row.line === 'string' && row.line.trim() ? row.line : null,
    url: typeof row.url === 'string' && row.url.trim() ? row.url : null,
    since: row.since == null ? null : asNumber(row.since),
    profileName: typeof row.profileName === 'string' ? row.profileName : null,
    profileKind: typeof row.profileKind === 'string' ? row.profileKind : null,
    profileIndustry:
      typeof row.profileIndustry === 'string' ? row.profileIndustry : null,
    profileAvatar:
      typeof row.profileAvatar === 'string' ? row.profileAvatar : null,
    searchText: typeof row.searchText === 'string' ? row.searchText : null,
    blockHeight: asNumber(row.blockHeight),
    blockTimestamp: asNumber(row.blockTimestamp),
  };
}

export class OffersSearchQuery {
  constructor(private _q: QueryModule) {}

  /** Standing services whose title, line, or profile matches. */
  async search(opts: OfferSearchOptions = {}): Promise<OfferSearchRow[]> {
    const decls = ['$limit: Int!', '$offset: Int!'];
    const variables: Record<string, unknown> = {
      limit: opts.limit ?? 24,
      offset: opts.offset ?? 0,
    };
    const clauses: string[] = [];
    const needle = opts.query?.trim();
    if (needle) {
      decls.push('$pattern: String!');
      variables.pattern = `%${needle}%`;
      clauses.push('{searchText: {_ilike: $pattern}}');
    }
    const filter =
      clauses.length === 0
        ? ''
        : clauses.length === 1
          ? `where: ${clauses[0]}, `
          : `where: {_and: [${clauses.join(', ')}]}, `;
    const res = await this._q.graphql<{
      offersSearch: Array<Record<string, unknown>>;
    }>({
      query: `query OffersSearch(${decls.join(', ')}) {
        offersSearch(
          ${filter}
          limit: $limit,
          offset: $offset,
          orderBy: [{since: ASC}, {blockHeight: DESC}]
        ) {
          ${OFFER_SEARCH_FIELDS}
        }
      }`,
      variables,
    });
    return (res.data?.offersSearch ?? []).map(mapOfferRow);
  }
}
