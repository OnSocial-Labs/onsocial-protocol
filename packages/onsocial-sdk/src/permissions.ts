// ---------------------------------------------------------------------------
// OnSocial SDK — permissions module (account + key permissions)
// ---------------------------------------------------------------------------

import type { HttpClient } from './http.js';
import { resolveContractId } from './contracts.js';
import type { PermissionLevel, RelayResponse } from './types.js';

/**
 * Named permission level constants (matches the contract's
 * `permissions/kv/types.rs`):
 *
 * - `NONE` (0) — revokes any prior grant.
 * - `WRITE` (1) — read + write (a.k.a. "post" or basic content).
 * - `MODERATE` (2) — write + remove others' content.
 * - `MANAGE` (3) — moderate + delegate lower levels (cannot delegate MANAGE).
 *
 * Use these instead of magic numbers:
 *
 * ```ts
 * import { PERMISSION } from '@onsocial/sdk';
 * await os.permissions.grant(bob, 'profile/', PERMISSION.WRITE);
 * ```
 */
export const PERMISSION = {
  NONE: 0,
  WRITE: 1,
  MODERATE: 2,
  MANAGE: 3,
} as const satisfies Record<string, PermissionLevel>;

export type PermissionName = keyof typeof PERMISSION;

/**
 * Permissions — read and manage account-level and key-level permissions.
 *
 * ```ts
 * const canWrite = await os.permissions.has('alice.near', 'bob.near', 'post', 2);
 * const level = await os.permissions.get('alice.near', 'bob.near', 'post');
 * const isAdmin = await os.permissions.hasGroupAdmin('dao', 'alice.near');
 * ```
 */
export class PermissionsModule {
  private _coreContract: string;

  constructor(private _http: HttpClient) {
    this._coreContract = resolveContractId(_http.network, 'core');
  }

  /**
   * Send a permission write to the relayer with `wait=true` so the SDK throws
   * `RelayExecutionError` if the transaction reverts on chain (e.g. attempting
   * a direct grant on a member-driven group's `groups/{id}/...` paths, which
   * the contract intentionally rejects).
   *
   * Without this, callers would see a plausible `success: true, tx_hash: ...`
   * response while the chain silently rejected the grant — corrupting any
   * follow-up logic that assumed the permission landed.
   */
  private execute(action: Record<string, unknown>): Promise<RelayResponse> {
    return this._http.post<RelayResponse>('/relay/execute?wait=true', {
      action,
      target_account: this._coreContract,
    });
  }

  // ── Write methods ─────────────────────────────────────────────────────

  /**
   * Grant a path-scoped permission directly via `set_permission`.
   *
   * **Member-driven groups:** When `path` targets `groups/{id}/...` and the
   * group has `member_driven: true`, this call will be **rejected on-chain**
   * and surface as a `RelayExecutionError`. Use
   * `os.groups.proposePermissionGrant(groupId, ...)` instead so the change
   * passes through governance.
   *
   * Use `os.groups.isMemberDriven(groupId)` to detect which mode applies.
   */
  async grant(
    grantee: string,
    path: string,
    level: PermissionLevel,
    expiresAt?: number
  ): Promise<RelayResponse> {
    return this.execute({
      type: 'set_permission',
      grantee,
      path,
      level,
      ...(expiresAt !== undefined && { expires_at: expiresAt }),
    });
  }

  async grantKey(
    publicKey: string,
    path: string,
    level: PermissionLevel,
    expiresAt?: number
  ): Promise<RelayResponse> {
    return this.execute({
      type: 'set_key_permission',
      public_key: publicKey,
      path,
      level,
      ...(expiresAt !== undefined && { expires_at: expiresAt }),
    });
  }

  /**
   * Revoke a previously granted account permission. Equivalent to calling
   * `grant(grantee, path, 0)` but reads more clearly at call sites.
   */
  revoke(grantee: string, path: string): Promise<RelayResponse> {
    return this.grant(grantee, path, 0);
  }

  /**
   * Revoke a previously granted key permission. Equivalent to calling
   * `grantKey(publicKey, path, 0)` but reads more clearly at call sites.
   */
  revokeKey(publicKey: string, path: string): Promise<RelayResponse> {
    return this.grantKey(publicKey, path, 0);
  }

  /**
   * Smart router for `groups/{id}/...` paths: detects whether the group is
   * member-driven and either calls `grant()` directly or files a governance
   * proposal via `path_permission_grant`.
   *
   * For non-group paths, behaves exactly like `grant()`.
   *
   * Set `level: 0` (or use `revokeOrPropose`) to revoke.
   *
   * ```ts
   * await os.permissions.grantOrPropose(bob, `groups/${id}/content/`, 1, {
   *   reason: 'New content moderator',
   * });
   * ```
   */
  async grantOrPropose(
    grantee: string,
    path: string,
    level: PermissionLevel,
    opts: { reason?: string; expiresAt?: number } = {}
  ): Promise<RelayResponse> {
    const groupId = extractGroupId(path);
    if (!groupId) {
      return this.grant(grantee, path, level, opts.expiresAt);
    }

    const memberDriven = await this._isGroupMemberDriven(groupId);
    if (!memberDriven) {
      return this.grant(grantee, path, level, opts.expiresAt);
    }

    if (level === 0) {
      return this.execute({
        type: 'create_proposal',
        group_id: groupId,
        proposal_type: 'path_permission_revoke',
        changes: {
          target_user: grantee,
          path,
          reason: opts.reason ?? 'Revoke path permission',
        },
      });
    }

    return this.execute({
      type: 'create_proposal',
      group_id: groupId,
      proposal_type: 'path_permission_grant',
      changes: {
        target_user: grantee,
        path,
        level,
        reason: opts.reason ?? 'Grant path permission',
      },
    });
  }

  /** Companion to `grantOrPropose` for revocations. */
  revokeOrPropose(
    grantee: string,
    path: string,
    opts: { reason?: string } = {}
  ): Promise<RelayResponse> {
    return this.grantOrPropose(grantee, path, 0, opts);
  }

  private async _isGroupMemberDriven(groupId: string): Promise<boolean> {
    const p = new URLSearchParams({ groupId });
    const cfg = await this._http.get<Record<string, unknown> | null>(
      `/data/group-config?${p}`
    );
    return Boolean(cfg && (cfg as { member_driven?: unknown }).member_driven);
  }

  // ── View reads ────────────────────────────────────────────────────────

  async has(
    owner: string,
    grantee: string,
    path: string,
    level: PermissionLevel
  ): Promise<boolean> {
    const p = new URLSearchParams({
      owner,
      grantee,
      path,
      level: String(level),
    });
    return this._http.get<boolean>(`/data/has-permission?${p}`);
  }

  async get(owner: string, grantee: string, path: string): Promise<number> {
    const p = new URLSearchParams({ owner, grantee, path });
    return this._http.get<number>(`/data/permissions?${p}`);
  }

  async getKeyPermissions(
    owner: string,
    publicKey: string,
    path: string
  ): Promise<number> {
    const p = new URLSearchParams({ owner, publicKey, path });
    return this._http.get<number>(`/data/key-permissions?${p}`);
  }

  async hasKeyPermission(
    owner: string,
    publicKey: string,
    path: string,
    level: PermissionLevel
  ): Promise<boolean> {
    const p = new URLSearchParams({
      owner,
      publicKey,
      path,
      level: String(level),
    });
    return this._http.get<boolean>(`/data/has-key-permission?${p}`);
  }

  async hasGroupAdmin(groupId: string, userId: string): Promise<boolean> {
    const p = new URLSearchParams({ groupId, userId });
    return this._http.get<boolean>(`/data/has-group-admin?${p}`);
  }

  async hasGroupModerate(groupId: string, userId: string): Promise<boolean> {
    const p = new URLSearchParams({ groupId, userId });
    return this._http.get<boolean>(`/data/has-group-moderate?${p}`);
  }
}

/**
 * Extracts the `{id}` from a path that begins with `groups/{id}/...`.
 * Returns `null` for non-group paths.
 */
function extractGroupId(path: string): string | null {
  const match = /^groups\/([^/]+)\//.exec(path);
  return match ? match[1] : null;
}
