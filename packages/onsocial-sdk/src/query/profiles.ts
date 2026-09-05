// ---------------------------------------------------------------------------
// Profile queries.
// Accessed as `os.query.profiles.<method>()`.
// ---------------------------------------------------------------------------

import type { QueryModule } from './index.js';
import type { StandingListItem } from './standings.js';
import {
  parseProfileKind,
  type ProfileKind,
} from '../builders/profile-kind.js';

export interface ProfileSearchRow {
  accountId: string;
  name: string | null;
  bio: string | null;
  avatar: string | null;
  banner: string | null;
  /** Optional `profile/kind` from profiles_current / profile_discover. */
  kind?: ProfileKind;
  industry?: string | null;
  openJobsCount?: number;
  standingCount: number;
  standingWithCount: number;
  mutualStandingCount: number;
  endorsementsReceivedCount: number;
  endorsementsGivenCount: number;
  firstProfileTimestamp: number | null;
  lastProfileBlock: number;
  lastProfileTimestamp: number;
  lastActivityBlock: number;
  /** Soft Discover rank = reputation × confidence (from profile_discover). */
  discoverScore?: number;
  reputation?: number;
  confidenceScore?: number;
}

export type DiscoverFaceKind = 'person' | 'org' | 'dao';

/** Discover chip rail — not a new tab. Hiring implies orgs with open roles. */
export type DiscoverFaceFilter = 'all' | 'people' | 'orgs' | 'daos' | 'hiring';

export function parseDiscoverFaceFilter(
  raw: string | null | undefined
): DiscoverFaceFilter {
  const value = (raw ?? '').trim().toLowerCase();
  if (value === 'people' || value === 'person') return 'people';
  if (value === 'orgs' || value === 'org') return 'orgs';
  if (value === 'daos' || value === 'dao') return 'daos';
  if (value === 'hiring') return 'hiring';
  return 'all';
}

export function discoverFaceSearchOptions(
  face: DiscoverFaceFilter,
  industry?: string | null,
  craft?: string | null
): Pick<ProfileSearchOptions, 'kind' | 'industry' | 'hiring' | 'craft'> {
  const sector = face === 'people' ? undefined : industry?.trim() || undefined;
  const craftTag = craft?.trim().toLowerCase() || undefined;
  if (face === 'hiring') {
    return { kind: 'org', hiring: true, industry: sector };
  }
  if (face === 'orgs') {
    return { kind: 'org', industry: sector };
  }
  if (face === 'daos') {
    return { kind: 'dao', industry: sector };
  }
  if (face === 'people' || craftTag) {
    return {
      kind: 'person',
      ...(craftTag ? { craft: craftTag } : {}),
    };
  }
  return {
    ...(sector ? { industry: sector } : {}),
    ...(craftTag ? { craft: craftTag } : {}),
  };
}

export interface ProfileSearchOptions {
  query?: string;
  limit?: number;
  offset?: number;
  /** Person, Organization, or DAO house. Factory NEAR DAOs stay on the DAOs tab. */
  kind?: DiscoverFaceKind;
  industry?: string;
  /** Curated About craft (`profile/tags`) — exact people facet. */
  craft?: string;
  /** Internal — account ids resolved from {@link craft}. */
  accountIds?: string[];
  hiring?: boolean;
  /**
   * `discover` (default) — reputation × confidence, then standing, then activity.
   * `activity` — last stand / endorse / profile write, then standing.
   */
  order?: 'discover' | 'activity';
}

export interface ProfileDiscoverStandingRow {
  accountId: string;
  targetAccount: string;
  since: number | null;
  blockTimestamp: number;
}

export interface ProfileDiscoverViewerContext {
  outgoing: ProfileDiscoverStandingRow[];
  incomingAccountIds: string[];
  endorsementIssuers: string[];
  endorsementTargets: string[];
}

export interface ProfileDiscoverPageOptions extends ProfileSearchOptions {
  /** When set, viewer graph context is batched for the returned profile page only. */
  viewerAccountId?: string;
}

export interface ProfileDiscoverPageResult {
  profiles: ProfileSearchRow[];
  viewer: ProfileDiscoverViewerContext | null;
}

export interface ProfileSocialPreviewOptions {
  accountId: string;
  viewerAccountId?: string | null;
  previewLimit?: number;
}

export interface ProfileSocialPreviewResult {
  accountId: string;
  viewerAccountId: string | null;
  counts: { incoming: number; outgoing: number; mutual: number };
  endorsementCounts: { received: number; given: number };
  incoming: StandingListItem[];
  outgoing: StandingListItem[];
  mutual: StandingListItem[];
  viewerStanding: boolean;
  theyStandWithViewer: boolean;
  peers: ProfileSearchRow[];
  viewerOutgoingPeerIds: string[];
  viewerIncomingPeerIds: string[];
}

function parseStandingSince(raw: string | null | undefined): number | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as { since?: unknown };
    return typeof parsed.since === 'number' ? parsed.since : null;
  } catch {
    return null;
  }
}

const PROFILE_SEARCH_FIELDS = `
  accountId name bio avatar banner kind industry openJobsCount
  standingCount standingWithCount mutualStandingCount
  endorsementsReceivedCount endorsementsGivenCount
  firstProfileTimestamp
  lastProfileBlock lastProfileTimestamp lastActivityBlock
`;

const PROFILE_DISCOVER_FIELDS = `
  ${PROFILE_SEARCH_FIELDS}
  discoverScore reputation confidenceScore
`;

const PROFILE_KINDS_SELECTION = `
  profileKinds: profilesCurrent(
    where: {accountId: {_in: $ids}, field: {_eq: "kind"}}
    limit: $limit
  ) {
    accountId value
  }
`;

export function profileKindsFromCurrentRows(
  rows: Array<{ accountId: string; value: string }> | null | undefined
): Record<string, ProfileKind> {
  const out: Record<string, ProfileKind> = {};
  for (const row of rows ?? []) {
    const parsed = parseProfileKind(row.value);
    if (parsed) out[row.accountId] = parsed;
  }
  return out;
}

export function applyProfileSearchKinds<T extends { accountId: string }>(
  rows: T[],
  kinds: Record<string, ProfileKind>
): T[] {
  if (Object.keys(kinds).length === 0) return rows;
  return rows.map((row) => {
    const kind = kinds[row.accountId];
    return kind ? { ...row, kind } : row;
  });
}

export function buildDiscoverWhere(opts: ProfileSearchOptions): {
  filter: string;
  variableDecl: string;
  variables: Record<string, unknown>;
} {
  const clauses: string[] = [];
  const decls: string[] = [];
  const variables: Record<string, unknown> = {};
  const query = opts.query?.trim();
  if (query) {
    decls.push('$pattern: String!');
    variables.pattern = `%${query}%`;
    clauses.push('{searchText: {_ilike: $pattern}}');
  }
  if (opts.kind === 'org') {
    clauses.push('{kind: {_eq: "org"}}');
  } else if (opts.kind === 'dao') {
    clauses.push('{kind: {_eq: "dao"}}');
  } else if (opts.kind === 'person') {
    clauses.push('{_or: [{kind: {_eq: "person"}}, {kind: {_isNull: true}}]}');
  }
  const industry = opts.industry?.trim();
  if (industry) {
    decls.push('$industry: String!');
    variables.industry = industry;
    clauses.push('{industry: {_eq: $industry}}');
  }
  if (opts.accountIds) {
    if (opts.accountIds.length === 0) {
      clauses.push('{accountId: {_eq: "__none__"}}');
    } else {
      decls.push('$accountIds: [String!]!');
      variables.accountIds = opts.accountIds;
      clauses.push('{accountId: {_in: $accountIds}}');
    }
  }
  if (opts.hiring) {
    clauses.push('{openJobsCount: {_gt: 0}}');
  }
  if (clauses.length === 0) {
    return { filter: '', variableDecl: '', variables };
  }
  const filter =
    clauses.length === 1
      ? `where: ${clauses[0]}, `
      : `where: {_and: [${clauses.join(', ')}]}, `;
  return {
    filter,
    variableDecl: decls.length ? `, ${decls.join(', ')}` : '',
    variables,
  };
}

function discoverOrderByClause(order?: 'discover' | 'activity'): string {
  if (order === 'activity') {
    return '[{lastActivityBlock: DESC}, {standingCount: DESC}]';
  }
  return '[{discoverScore: DESC}, {standingCount: DESC}, {lastActivityBlock: DESC}]';
}

function mapDiscoverRows(
  rows: Array<
    ProfileSearchRow & {
      discoverScore?: number | string | null;
      reputation?: number | string | null;
      confidenceScore?: number | string | null;
      openJobsCount?: number | string | null;
    }
  >
): ProfileSearchRow[] {
  return rows.map((row) => ({
    ...row,
    industry:
      typeof row.industry === 'string' && row.industry.trim()
        ? row.industry
        : null,
    openJobsCount:
      row.openJobsCount == null ? 0 : Number(row.openJobsCount) || 0,
    discoverScore:
      row.discoverScore == null ? undefined : Number(row.discoverScore),
    reputation: row.reputation == null ? undefined : Number(row.reputation),
    confidenceScore:
      row.confidenceScore == null ? undefined : Number(row.confidenceScore),
  }));
}

function mapOutgoingStandingRows(
  rows: Array<{
    accountId: string;
    targetAccount: string;
    value: string | null;
    blockHeight: number;
    blockTimestamp: number;
  }>
): ProfileDiscoverStandingRow[] {
  return rows.map((row) => ({
    accountId: row.accountId,
    targetAccount: row.targetAccount,
    since: parseStandingSince(row.value),
    blockTimestamp: Number(row.blockTimestamp) || 0,
  }));
}

export class ProfilesQuery {
  constructor(private _q: QueryModule) {}

  /**
   * Get a profile as a merged field→value map. Returns `null` if the
   * account has no profile entries indexed.
   *
   * ```ts
   * const profile = await os.query.profiles.get('alice.near');
   * ```
   */
  async get(accountId: string): Promise<Record<string, string> | null> {
    const res = await this._q.graphql<{
      profilesCurrent: Array<{
        accountId: string;
        field: string;
        value: string;
        blockHeight: number;
        blockTimestamp: number;
        operation: string;
      }>;
    }>({
      query: `query Profile($id: String!) {
        profilesCurrent(where: {accountId: {_eq: $id}}) {
          accountId field value blockHeight blockTimestamp operation
        }
      }`,
      variables: { id: accountId },
    });
    const rows = res.data?.profilesCurrent;
    if (!rows || rows.length === 0) return null;
    const out: Record<string, string> = {};
    for (const row of rows) out[row.field] = row.value;
    return out;
  }

  /**
   * Look up a single discoverable profile row by exact account id.
   * Returns `null` when the account is not in the profile search index.
   *
   * ```ts
   * const row = await os.query.profiles.lookup('alice.near');
   * ```
   */
  async lookup(accountId: string): Promise<ProfileSearchRow | null> {
    const res = await this._q.graphql<{
      profileSearch: ProfileSearchRow[];
      profileKinds: Array<{ accountId: string; value: string }>;
    }>({
      query: `query ProfileLookup($id: String!) {
        profileSearch(where: {accountId: {_eq: $id}}, limit: 1) {
          accountId name bio avatar banner
          standingCount standingWithCount mutualStandingCount
          endorsementsReceivedCount endorsementsGivenCount
          firstProfileTimestamp
          lastProfileBlock lastProfileTimestamp lastActivityBlock
        }
        profileKinds: profilesCurrent(
          where: {accountId: {_eq: $id}, field: {_eq: "kind"}}
          limit: 1
        ) {
          accountId value
        }
      }`,
      variables: { id: accountId },
    });
    const row = res.data?.profileSearch?.[0];
    if (!row) return null;
    return applyProfileSearchKinds(
      [row],
      profileKindsFromCurrentRows(res.data?.profileKinds)
    )[0];
  }

  /**
   * Batch profile search stats for graph list enrichment.
   */
  /**
   * Batch `profile/kind` from `profiles_current` (not on profile_search yet).
   */
  async kindsForAccounts(
    accountIds: string[]
  ): Promise<Record<string, ProfileKind>> {
    const ids = [...new Set(accountIds.map((id) => id.trim()).filter(Boolean))];
    if (ids.length === 0) return {};

    const res = await this._q.graphql<{
      profileKinds: Array<{ accountId: string; value: string }>;
    }>({
      query: `query ProfileKinds($ids: [String!]!, $limit: Int!) {
        ${PROFILE_KINDS_SELECTION}
      }`,
      variables: { ids, limit: ids.length },
    });
    return profileKindsFromCurrentRows(res.data?.profileKinds);
  }

  async statsForAccounts(accountIds: string[]): Promise<ProfileSearchRow[]> {
    const ids = [...new Set(accountIds.map((id) => id.trim()).filter(Boolean))];
    if (ids.length === 0) return [];

    const res = await this._q.graphql<{
      profileSearch: ProfileSearchRow[];
      profileKinds: Array<{ accountId: string; value: string }>;
    }>({
      query: `query ProfileStatsBatch($ids: [String!]!, $limit: Int!) {
        profileSearch(where: {accountId: {_in: $ids}}, limit: $limit) {
          ${PROFILE_SEARCH_FIELDS}
        }
        ${PROFILE_KINDS_SELECTION}
      }`,
      variables: { ids, limit: ids.length },
    });
    return applyProfileSearchKinds(
      res.data?.profileSearch ?? [],
      profileKindsFromCurrentRows(res.data?.profileKinds)
    );
  }

  /**
   * Search discoverable profiles by account id, display name, or bio.
   * Empty query returns soft-ranked Discover rows (reputation × confidence),
   * with standing / activity as tie-breakers. Text matches keep the same order.
   *
   * ```ts
   * const profiles = await os.query.profiles.search({ query: 'alice' });
   * ```
   */
  async search(opts: ProfileSearchOptions = {}): Promise<ProfileSearchRow[]> {
    const craft = opts.craft?.trim().toLowerCase();
    let accountIds = opts.accountIds;
    if (craft && !accountIds) {
      accountIds = await this.accountIdsForCraft(craft);
      if (accountIds.length === 0) return [];
    }
    const { filter, variableDecl, variables } = buildDiscoverWhere({
      ...opts,
      accountIds,
    });
    const res = await this._q.graphql<{
      profileDiscover: Array<
        ProfileSearchRow & {
          discoverScore?: number | string | null;
          reputation?: number | string | null;
          confidenceScore?: number | string | null;
        }
      >;
    }>({
      query: `query ProfileDiscover($limit: Int!, $offset: Int!${variableDecl}) {
        profileDiscover(
          ${filter}
          limit: $limit,
          offset: $offset,
          orderBy: ${discoverOrderByClause(opts.order)}
        ) {
          ${PROFILE_DISCOVER_FIELDS}
        }
      }`,
      variables: {
        limit: opts.limit ?? 20,
        offset: opts.offset ?? 0,
        ...variables,
      },
    });
    return mapDiscoverRows(res.data?.profileDiscover ?? []);
  }

  /** Accounts that list this curated About craft (`profile/tags`). */
  async accountIdsForCraft(craft: string): Promise<string[]> {
    const tag = craft.trim().toLowerCase();
    if (!tag) return [];
    const res = await this._q.graphql<{
      profileTags: Array<{ accountId: string }>;
    }>({
      query: `query ProfileCraftAccounts($tag: String!) {
        profileTags(where: {tag: {_eq: $tag}}, limit: 1000) {
          accountId
        }
      }`,
      variables: { tag },
    });
    return [
      ...new Set((res.data?.profileTags ?? []).map((row) => row.accountId)),
    ];
  }

  /**
   * Popular About crafts by people count.
   *
   * ```ts
   * const crafts = await os.query.profiles.craftCounts({ limit: 40, minCount: 2 });
   * ```
   */
  async craftCounts(
    opts: { limit?: number; minCount?: number } = {}
  ): Promise<Array<{ tag: string; profileCount: number; lastBlock: number }>> {
    const minCount = Math.max(1, opts.minCount ?? 1);
    const res = await this._q.graphql<{
      profileTagCounts: Array<{
        tag: string;
        profileCount: number | string;
        lastBlock: number | string;
      }>;
    }>({
      query: `query ProfileCraftCounts($limit: Int!, $minCount: Int!) {
        profileTagCounts(
          where: {profileCount: {_gte: $minCount}},
          orderBy: [{profileCount: DESC}, {lastBlock: DESC}],
          limit: $limit
        ) {
          tag profileCount lastBlock
        }
      }`,
      variables: {
        limit: opts.limit ?? 40,
        minCount,
      },
    });
    return (res.data?.profileTagCounts ?? []).map((row) => ({
      tag: row.tag,
      profileCount: Number(row.profileCount) || 0,
      lastBlock: Number(row.lastBlock) || 0,
    }));
  }

  /**
   * Discover page — searchable profiles plus optional viewer graph context.
   * Without `viewerAccountId`, delegates to {@link search} (one round-trip).
   * With a viewer, search then one batched standings + endorsements query
   * (two round-trips; skips the context query when the page is empty).
   *
   * ```ts
   * const page = await os.query.profiles.discoverPage({
   *   query: 'alice',
   *   limit: 24,
   *   viewerAccountId: 'bob.near',
   * });
   * ```
   */
  async discoverPage(
    opts: ProfileDiscoverPageOptions = {}
  ): Promise<ProfileDiscoverPageResult> {
    const limit = opts.limit ?? 20;
    const offset = opts.offset ?? 0;
    const viewerAccountId = opts.viewerAccountId?.trim();

    if (!viewerAccountId) {
      const profiles = await this.search({
        query: opts.query,
        kind: opts.kind,
        industry: opts.industry,
        craft: opts.craft,
        hiring: opts.hiring,
        order: opts.order,
        limit,
        offset,
      });
      return { profiles, viewer: null };
    }

    const profiles = await this.search({
      query: opts.query,
      kind: opts.kind,
      industry: opts.industry,
      craft: opts.craft,
      hiring: opts.hiring,
      order: opts.order,
      limit,
      offset,
    });
    const targetIds = profiles.map((row) => row.accountId);

    if (targetIds.length === 0) {
      return {
        profiles,
        viewer: {
          outgoing: [],
          incomingAccountIds: [],
          endorsementIssuers: [],
          endorsementTargets: [],
        },
      };
    }

    const viewer = await this.loadDiscoverViewerContext(
      viewerAccountId,
      targetIds
    );
    return { profiles, viewer };
  }

  /**
   * Profile social preview — standing counts, three preview lists, and peer
   * enrichment in two graph round-trips (replaces ~11 parallel calls).
   *
   * ```ts
   * const social = await os.query.profiles.socialPreview({
   *   accountId: 'alice.near',
   *   viewerAccountId: 'bob.near',
   *   previewLimit: 8,
   * });
   * ```
   */
  async socialPreview(
    opts: ProfileSocialPreviewOptions
  ): Promise<ProfileSocialPreviewResult> {
    const accountId = opts.accountId.trim();
    const previewLimit = opts.previewLimit ?? 8;
    const viewerAccountId = opts.viewerAccountId?.trim() ?? null;
    const checkViewer =
      Boolean(viewerAccountId) && viewerAccountId !== accountId;

    const res = await this._q.graphql<{
      standingCounts: Array<{ standingWithCount: number }>;
      standingOutCounts: Array<{ standingWithOthersCount: number }>;
      profileSearch: Array<{
        mutualStandingCount: number;
        endorsementsReceivedCount: number;
        endorsementsGivenCount: number;
      }>;
      incomingPreview: Array<{
        accountId: string;
        targetAccount: string;
        value: string | null;
        blockHeight: number;
        blockTimestamp: number;
      }>;
      outgoingPreview: Array<{
        accountId: string;
        targetAccount: string;
        value: string | null;
        blockHeight: number;
        blockTimestamp: number;
      }>;
      mutualPreview: Array<{
        accountId: string;
        mutualAccount: string;
        value: string | null;
        blockHeight: number;
        blockTimestamp: number;
      }>;
      viewerToSubject: Array<{ accountId: string }>;
      subjectToViewer: Array<{ accountId: string }>;
    }>({
      query: checkViewer
        ? `query ProfileSocialPreviewWithViewer(
            $accountId: String!
            $previewLimit: Int!
            $viewer: String!
          ) {
            standingCounts(where: {accountId: {_eq: $accountId}}) {
              standingWithCount
            }
            standingOutCounts(where: {accountId: {_eq: $accountId}}) {
              standingWithOthersCount
            }
            profileSearch(where: {accountId: {_eq: $accountId}}, limit: 1) {
              mutualStandingCount
              endorsementsReceivedCount
              endorsementsGivenCount
            }
            incomingPreview: standingsCurrent(
              where: {targetAccount: {_eq: $accountId}}
              limit: $previewLimit
              offset: 0
              orderBy: [{blockTimestamp: DESC}]
            ) {
              accountId targetAccount value blockHeight blockTimestamp
            }
            outgoingPreview: standingsCurrent(
              where: {accountId: {_eq: $accountId}}
              limit: $previewLimit
              offset: 0
              orderBy: [{blockTimestamp: DESC}]
            ) {
              accountId targetAccount value blockHeight blockTimestamp
            }
            mutualPreview: mutualStandingsCurrent(
              where: {accountId: {_eq: $accountId}}
              limit: $previewLimit
              offset: 0
              orderBy: [{blockTimestamp: DESC}]
            ) {
              accountId mutualAccount value blockHeight blockTimestamp
            }
            viewerToSubject: standingsCurrent(
              where: {accountId: {_eq: $viewer}, targetAccount: {_eq: $accountId}}
              limit: 1
            ) {
              accountId
            }
            subjectToViewer: standingsCurrent(
              where: {accountId: {_eq: $accountId}, targetAccount: {_eq: $viewer}}
              limit: 1
            ) {
              accountId
            }
          }`
        : `query ProfileSocialPreview(
            $accountId: String!
            $previewLimit: Int!
          ) {
            standingCounts(where: {accountId: {_eq: $accountId}}) {
              standingWithCount
            }
            standingOutCounts(where: {accountId: {_eq: $accountId}}) {
              standingWithOthersCount
            }
            profileSearch(where: {accountId: {_eq: $accountId}}, limit: 1) {
              mutualStandingCount
              endorsementsReceivedCount
              endorsementsGivenCount
            }
            incomingPreview: standingsCurrent(
              where: {targetAccount: {_eq: $accountId}}
              limit: $previewLimit
              offset: 0
              orderBy: [{blockTimestamp: DESC}]
            ) {
              accountId targetAccount value blockHeight blockTimestamp
            }
            outgoingPreview: standingsCurrent(
              where: {accountId: {_eq: $accountId}}
              limit: $previewLimit
              offset: 0
              orderBy: [{blockTimestamp: DESC}]
            ) {
              accountId targetAccount value blockHeight blockTimestamp
            }
            mutualPreview: mutualStandingsCurrent(
              where: {accountId: {_eq: $accountId}}
              limit: $previewLimit
              offset: 0
              orderBy: [{blockTimestamp: DESC}]
            ) {
              accountId mutualAccount value blockHeight blockTimestamp
            }
          }`,
      variables: checkViewer
        ? {
            accountId,
            previewLimit,
            viewer: viewerAccountId!,
          }
        : { accountId, previewLimit },
    });

    const mapStandingRow = (row: {
      accountId: string;
      targetAccount: string;
      value: string | null;
      blockHeight: number;
      blockTimestamp: number;
    }): StandingListItem => ({
      accountId: row.accountId,
      targetAccount: row.targetAccount,
      since: parseStandingSince(row.value),
      blockHeight: Number(row.blockHeight) || 0,
      blockTimestamp: Number(row.blockTimestamp) || 0,
    });

    const incoming = (res.data?.incomingPreview ?? []).map(mapStandingRow);
    const outgoing = (res.data?.outgoingPreview ?? []).map(mapStandingRow);
    const mutual = (res.data?.mutualPreview ?? []).map((row) => ({
      accountId: row.mutualAccount,
      targetAccount: row.accountId,
      since: parseStandingSince(row.value),
      blockHeight: Number(row.blockHeight) || 0,
      blockTimestamp: Number(row.blockTimestamp) || 0,
    }));

    const peerAccountIds = [
      ...new Set([
        ...mutual.map((row) => row.accountId),
        ...incoming.map((row) => row.accountId),
        ...outgoing.map((row) => row.targetAccount),
      ]),
    ];

    const enrichment = await this._q.standings.enrichPeers(
      viewerAccountId,
      peerAccountIds
    );

    const subjectRow = res.data?.profileSearch?.[0];

    return {
      accountId,
      viewerAccountId,
      counts: {
        incoming: Number(res.data?.standingCounts?.[0]?.standingWithCount ?? 0),
        outgoing: Number(
          res.data?.standingOutCounts?.[0]?.standingWithOthersCount ?? 0
        ),
        mutual: Number(subjectRow?.mutualStandingCount ?? 0),
      },
      endorsementCounts: {
        received: Number(subjectRow?.endorsementsReceivedCount ?? 0),
        given: Number(subjectRow?.endorsementsGivenCount ?? 0),
      },
      incoming,
      outgoing,
      mutual,
      viewerStanding: checkViewer
        ? (res.data?.viewerToSubject?.length ?? 0) > 0
        : false,
      theyStandWithViewer: checkViewer
        ? (res.data?.subjectToViewer?.length ?? 0) > 0
        : false,
      peers: enrichment.profiles,
      viewerOutgoingPeerIds: enrichment.viewerOutgoingPeerIds,
      viewerIncomingPeerIds: enrichment.viewerIncomingPeerIds,
    };
  }

  private async loadDiscoverViewerContext(
    viewerAccountId: string,
    targetIds: string[]
  ): Promise<ProfileDiscoverViewerContext> {
    const targets = [
      ...new Set(targetIds.map((id) => id.trim()).filter(Boolean)),
    ];
    if (targets.length === 0) {
      return {
        outgoing: [],
        incomingAccountIds: [],
        endorsementIssuers: [],
        endorsementTargets: [],
      };
    }

    const res = await this._q.graphql<{
      viewerOutgoing: Array<{
        accountId: string;
        targetAccount: string;
        value: string | null;
        blockHeight: number;
        blockTimestamp: number;
      }>;
      viewerIncoming: Array<{ accountId: string }>;
      viewerEndorsements: Array<{ issuer: string }>;
      viewerOutgoingEndorsements: Array<{ target: string }>;
    }>({
      query: `query ProfileDiscoverViewerContext($viewer: String!, $pageAccountIds: [String!]!) {
        viewerOutgoing: standingsCurrent(
          where: {
            accountId: {_eq: $viewer},
            targetAccount: {_in: $pageAccountIds}
          }
        ) {
          accountId targetAccount value blockHeight blockTimestamp
        }
        viewerIncoming: standingsCurrent(
          where: {
            targetAccount: {_eq: $viewer},
            accountId: {_in: $pageAccountIds}
          }
        ) {
          accountId
        }
        viewerEndorsements: endorsementsCurrent(
          where: {
            target: {_eq: $viewer},
            issuer: {_in: $pageAccountIds},
            operation: {_eq: "set"}
          }
        ) {
          issuer
        }
        viewerOutgoingEndorsements: endorsementsCurrent(
          where: {
            issuer: {_eq: $viewer},
            target: {_in: $pageAccountIds},
            operation: {_eq: "set"}
          }
        ) {
          target
        }
      }`,
      variables: { viewer: viewerAccountId, pageAccountIds: targets },
    });

    return {
      outgoing: mapOutgoingStandingRows(res.data?.viewerOutgoing ?? []),
      incomingAccountIds: (res.data?.viewerIncoming ?? []).map(
        (row) => row.accountId
      ),
      endorsementIssuers: (res.data?.viewerEndorsements ?? []).map(
        (row) => row.issuer
      ),
      endorsementTargets: [
        ...new Set(
          (res.data?.viewerOutgoingEndorsements ?? []).map((row) => row.target)
        ),
      ],
    };
  }
}
