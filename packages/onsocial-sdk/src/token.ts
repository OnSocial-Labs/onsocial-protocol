// ---------------------------------------------------------------------------
// OnSocial SDK — token module (SOCIAL NEP-141 view reads)
// ---------------------------------------------------------------------------

import type { HttpClient } from './http.js';

/** NEP-148 fungible-token metadata as returned by `ft_metadata`. */
export interface FtMetadata {
  spec: string;
  name: string;
  symbol: string;
  decimals: number;
  icon?: string | null;
  reference?: string | null;
  reference_hash?: string | null;
}

/** NEP-145 storage balance as returned by `storage_balance_of`. */
export interface FtStorageBalance {
  total: string;
  available: string;
}

/**
 * Token — read-only views for the SOCIAL fungible-token (NEP-141) contract.
 *
 * Wraps the gateway `/data/ft-*` endpoints, which proxy the configured
 * SOCIAL token contract on the active network (`token.onsocial.testnet` or
 * `token.onsocial.near`).
 *
 * For event history (mints, burns, transfers) use `os.query.token.*`.
 *
 * ```ts
 * const meta = await os.token.metadata();
 * const supply = await os.token.totalSupply();
 * const bal = await os.token.balanceOf('alice.testnet');
 * ```
 */
export class TokenModule {
  constructor(private _http: HttpClient) {}

  /** Returns NEP-148 metadata (spec, name, symbol, decimals, icon, …). */
  async metadata(): Promise<FtMetadata> {
    return this._http.get<FtMetadata>(`/data/ft-metadata`);
  }

  /** Returns the total circulating supply as a yocto-string. */
  async totalSupply(): Promise<string> {
    return this._http.get<string>(`/data/ft-total-supply`);
  }

  /** Returns the SOCIAL balance of `accountId` as a yocto-string. */
  async balanceOf(accountId: string): Promise<string> {
    const p = new URLSearchParams({ accountId });
    return this._http.get<string>(`/data/ft-balance-of?${p}`);
  }

  /** Returns the NEP-145 storage balance, or `null` if unregistered. */
  async storageBalanceOf(accountId: string): Promise<FtStorageBalance | null> {
    const p = new URLSearchParams({ accountId });
    return this._http.get<FtStorageBalance | null>(
      `/data/ft-storage-balance?${p}`
    );
  }
}
