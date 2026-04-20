// ---------------------------------------------------------------------------
// OnSocial SDK — permissions module (account + key permissions)
// ---------------------------------------------------------------------------

import type { HttpClient } from './http.js';
import { resolveContractId } from './contracts.js';
import type { PermissionLevel, RelayResponse } from './types.js';

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

  private execute(action: Record<string, unknown>): Promise<RelayResponse> {
    return this._http.post<RelayResponse>('/relay/execute', {
      action,
      target_account: this._coreContract,
    });
  }

  // ── Write methods ─────────────────────────────────────────────────────

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

  async get(
    owner: string,
    grantee: string,
    path: string
  ): Promise<number> {
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

  async hasGroupAdmin(
    groupId: string,
    userId: string
  ): Promise<boolean> {
    const p = new URLSearchParams({ groupId, userId });
    return this._http.get<boolean>(`/data/has-group-admin?${p}`);
  }

  async hasGroupModerate(
    groupId: string,
    userId: string
  ): Promise<boolean> {
    const p = new URLSearchParams({ groupId, userId });
    return this._http.get<boolean>(`/data/has-group-moderate?${p}`);
  }
}
