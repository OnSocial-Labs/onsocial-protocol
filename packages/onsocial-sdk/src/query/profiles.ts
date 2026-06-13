// ---------------------------------------------------------------------------
// Profile queries.
// Accessed as `os.query.profiles.<method>()`.
// ---------------------------------------------------------------------------

import type { QueryModule } from './index.js';
import type { StandingListItem } from './standings.js';

export interface ProfileSearchRow {
  accountId: string;
  name: string | null;
  bio: string | null;
  avatar: string | null;
  banner: string | null;
  standingCount: number;
  standingWithCount: number;
  mutualStandingCount: number;
  endorsementsReceivedCount: number;
  endorsementsGivenCount: number;
  firstProfileTimestamp: number | null;
  lastProfileBlock: number;
  lastProfileTimestamp: number;
  lastActivityBlock: number;
}

export interface ProfileSearchOptions {
  query?: string;
  limit?: number;
  offset?: number;
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
}

export interface ProfileDiscoverPageOptions {
  query?: string;
  limit?: number;
  offset?: number;
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
  accountId name bio avatar banner
  standingCount standingWithCount mutualStandingCount
  endorsementsReceivedCount endorsementsGivenCount
  firstProfileTimestamp
  lastProfileBlock lastProfileTimestamp lastActivityBlock
`;

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
    const res = await this._q.graphql<{ profileSearch: ProfileSearchRow[] }>({
      query: `query ProfileLookup($id: String!) {
        profileSearch(where: {accountId: {_eq: $id}}, limit: 1) {
          accountId name bio avatar banner
          standingCount standingWithCount mutualStandingCount
          endorsementsReceivedCount endorsementsGivenCount
          firstProfileTimestamp
          lastProfileBlock lastProfileTimestamp lastActivityBlock
        }
      }`,
      variables: { id: accountId },
    });
    return res.data?.profileSearch?.[0] ?? null;
  }

  /**
   * Batch profile search stats for graph list enrichment.
   */
  async statsForAccounts(accountIds: string[]): Promise<ProfileSearchRow[]> {
    const ids = [...new Set(accountIds.map((id) => id.trim()).filter(Boolean))];
    if (ids.length === 0) return [];

    const res = await this._q.graphql<{ profileSearch: ProfileSearchRow[] }>({
      query: `query ProfileStatsBatch($ids: [String!]!, $limit: Int!) {
        profileSearch(where: {accountId: {_in: $ids}}, limit: $limit) {
          ${PROFILE_SEARCH_FIELDS}
        }
      }`,
      variables: { ids, limit: ids.length },
    });
    return res.data?.profileSearch ?? [];
  }

  /**
   * Search discoverable profiles by account id, display name, or bio.
   * Empty query returns recently active profiles, ordered by standing signal.
   *
   * ```ts
   * const profiles = await os.query.profiles.search({ query: 'alice' });
   * ```
   */
  async search(opts: ProfileSearchOptions = {}): Promise<ProfileSearchRow[]> {
    const query = opts.query?.trim();
    const filter = query ? 'where: {searchText: {_ilike: $pattern}}, ' : '';
    const variableDecl = query ? ', $pattern: String!' : '';
    const res = await this._q.graphql<{ profileSearch: ProfileSearchRow[] }>({
      query: `query ProfileSearch($limit: Int!, $offset: Int!${variableDecl}) {
        profileSearch(
          ${filter}
          limit: $limit,
          offset: $offset,
          orderBy: [{standingCount: DESC}, {lastActivityBlock: DESC}]
        ) {
          ${PROFILE_SEARCH_FIELDS}
        }
      }`,
      variables: {
        limit: opts.limit ?? 20,
        offset: opts.offset ?? 0,
        ...(query ? { pattern: `%${query}%` } : {}),
      },
    });
    return res.data?.profileSearch ?? [];
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
        limit,
        offset,
      });
      return { profiles, viewer: null };
    }

    const profiles = await this.search({
      query: opts.query,
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
    };
  }
}
