// ---------------------------------------------------------------------------
// Permission event queries.
// Accessed as `os.query.permissions.<method>()`.
//
// Backed by the `permission_updates` table populated by substreams. Returns
// historical grant/revoke events for both account- and key-scoped
// permissions emitted by the core contract.  For *current* on-chain
// permission state use `os.permissions.has` / `os.permissions.get`.
// ---------------------------------------------------------------------------

import type { QueryModule } from './index.js';

/** A single permission event as recorded by the indexer. */
export interface PermissionEventRow {
  operation: string;
  author: string;
  targetId: string;
  path: string;
  level: number;
  deleted: boolean;
  blockHeight: number;
  blockTimestamp: number;
}

const PERMISSION_EVENT_FIELDS = `
  operation
  author
  targetId
  path
  level
  deleted
  blockHeight
  blockTimestamp
`;

const ACCOUNT_GRANT_OPS = ['grant'];
const ACCOUNT_REVOKE_OPS = ['revoke'];
const KEY_GRANT_OPS = ['grant_key', 'key_grant'];
const KEY_REVOKE_OPS = ['revoke_key', 'key_revoke'];
const ALL_GRANT_OPS = [...ACCOUNT_GRANT_OPS, ...KEY_GRANT_OPS];

export class PermissionsQuery {
  constructor(private _q: QueryModule) {}

  /**
   * Permission grants issued **by** an account (`author = id`,
   * operation ∈ grant/grant_key).
   *
   * ```ts
   * const issued = await os.query.permissions.grantsBy('alice.near', { limit: 20 });
   * ```
   */
  async grantsBy(
    author: string,
    opts: { limit?: number } = {}
  ): Promise<PermissionEventRow[]> {
    const res = await this._q.graphql<{
      permissionUpdates: PermissionEventRow[];
    }>({
      query: `query PermissionGrantsBy($id: String!, $ops: [String!]!, $limit: Int!) {
        permissionUpdates(
          where: { author: {_eq: $id}, operation: {_in: $ops} },
          limit: $limit,
          orderBy: [{blockHeight: DESC}]
        ) { ${PERMISSION_EVENT_FIELDS} }
      }`,
      variables: { id: author, ops: ALL_GRANT_OPS, limit: opts.limit ?? 50 },
    });
    return res.data?.permissionUpdates ?? [];
  }

  /**
   * Permission grants received **by** an account (`targetId = id`,
   * operation ∈ grant). Key grants don't have a targetId so they're not
   * included here — use {@link keyGrantsBy} for those.
   *
   * ```ts
   * const received = await os.query.permissions.grantsTo('bob.near');
   * ```
   */
  async grantsTo(
    grantee: string,
    opts: { limit?: number } = {}
  ): Promise<PermissionEventRow[]> {
    const res = await this._q.graphql<{
      permissionUpdates: PermissionEventRow[];
    }>({
      query: `query PermissionGrantsTo($id: String!, $ops: [String!]!, $limit: Int!) {
        permissionUpdates(
          where: { targetId: {_eq: $id}, operation: {_in: $ops} },
          limit: $limit,
          orderBy: [{blockHeight: DESC}]
        ) { ${PERMISSION_EVENT_FIELDS} }
      }`,
      variables: {
        id: grantee,
        ops: ACCOUNT_GRANT_OPS,
        limit: opts.limit ?? 50,
      },
    });
    return res.data?.permissionUpdates ?? [];
  }

  /**
   * Full audit log for a path — every grant and revoke (account or key) ever
   * recorded against the given owner-prefixed path.
   *
   * ```ts
   * const log = await os.query.permissions.forPath('alice.near/profile/');
   * ```
   */
  async forPath(
    path: string,
    opts: { limit?: number } = {}
  ): Promise<PermissionEventRow[]> {
    const res = await this._q.graphql<{
      permissionUpdates: PermissionEventRow[];
    }>({
      query: `query PermissionForPath($path: String!, $limit: Int!) {
        permissionUpdates(
          where: { path: {_eq: $path} },
          limit: $limit,
          orderBy: [{blockHeight: DESC}]
        ) { ${PERMISSION_EVENT_FIELDS} }
      }`,
      variables: { path, limit: opts.limit ?? 100 },
    });
    return res.data?.permissionUpdates ?? [];
  }

  /**
   * Full timeline for an account — every event where the account is either
   * the author *or* the target (grant/revoke, account or key).
   *
   * ```ts
   * const timeline = await os.query.permissions.history('alice.near');
   * ```
   */
  async history(
    accountId: string,
    opts: { limit?: number } = {}
  ): Promise<PermissionEventRow[]> {
    const res = await this._q.graphql<{
      permissionUpdates: PermissionEventRow[];
    }>({
      query: `query PermissionHistory($id: String!, $limit: Int!) {
        permissionUpdates(
          where: {
            _or: [
              { author: {_eq: $id} },
              { targetId: {_eq: $id} }
            ]
          },
          limit: $limit,
          orderBy: [{blockHeight: DESC}]
        ) { ${PERMISSION_EVENT_FIELDS} }
      }`,
      variables: { id: accountId, limit: opts.limit ?? 100 },
    });
    return res.data?.permissionUpdates ?? [];
  }

  /**
   * Key-scoped grants issued by an account (`author = id`, operation ∈
   * grant_key/key_grant). The `targetId` for key events is empty since the
   * subject is the public key, recorded in the path prefix.
   *
   * ```ts
   * const keys = await os.query.permissions.keyGrantsBy('alice.near');
   * ```
   */
  async keyGrantsBy(
    author: string,
    opts: { limit?: number } = {}
  ): Promise<PermissionEventRow[]> {
    const res = await this._q.graphql<{
      permissionUpdates: PermissionEventRow[];
    }>({
      query: `query KeyPermissionGrantsBy($id: String!, $ops: [String!]!, $limit: Int!) {
        permissionUpdates(
          where: { author: {_eq: $id}, operation: {_in: $ops} },
          limit: $limit,
          orderBy: [{blockHeight: DESC}]
        ) { ${PERMISSION_EVENT_FIELDS} }
      }`,
      variables: { id: author, ops: KEY_GRANT_OPS, limit: opts.limit ?? 50 },
    });
    return res.data?.permissionUpdates ?? [];
  }
}

// Re-exported for tests/consumers that want to filter manually.
export const PERMISSION_OPERATIONS = {
  ACCOUNT_GRANT: ACCOUNT_GRANT_OPS,
  ACCOUNT_REVOKE: ACCOUNT_REVOKE_OPS,
  KEY_GRANT: KEY_GRANT_OPS,
  KEY_REVOKE: KEY_REVOKE_OPS,
} as const;
