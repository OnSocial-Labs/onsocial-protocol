// ---------------------------------------------------------------------------
// OnSocial SDK — chain module (on-chain storage, contract info, nonces)
// ---------------------------------------------------------------------------

import type { HttpClient } from './http.js';
import type {
  ContractInfo,
  ContractStatus,
  GovernanceConfig,
  OnChainStorageBalance,
  PlatformAllowanceInfo,
  PlatformPoolInfo,
} from './types.js';

/**
 * Chain — on-chain storage management and contract introspection.
 *
 * ```ts
 * const balance = await os.chain.getStorageBalance('alice.near');
 * const info = await os.chain.getContractInfo();
 * const nonce = await os.chain.getNonce('alice.near', 'ed25519:...');
 * ```
 */
export class ChainModule {
  constructor(private _http: HttpClient) {}

  // ── Storage views ─────────────────────────────────────────────────────

  async getStorageBalance(
    accountId: string
  ): Promise<OnChainStorageBalance | null> {
    const p = new URLSearchParams({ accountId });
    return this._http.get(`/data/storage-balance?${p}`);
  }

  async getPlatformPool(): Promise<PlatformPoolInfo | null> {
    return this._http.get(`/data/platform-pool`);
  }

  async getGroupPoolInfo(
    groupId: string
  ): Promise<Record<string, unknown> | null> {
    const p = new URLSearchParams({ groupId });
    return this._http.get(`/data/group-pool?${p}`);
  }

  async getSharedPool(poolId: string): Promise<Record<string, unknown> | null> {
    const p = new URLSearchParams({ poolId });
    return this._http.get(`/data/shared-pool?${p}`);
  }

  async getPlatformAllowance(
    accountId: string
  ): Promise<PlatformAllowanceInfo> {
    const p = new URLSearchParams({ accountId });
    return this._http.get<PlatformAllowanceInfo>(
      `/data/platform-allowance?${p}`
    );
  }

  async getNonce(accountId: string, publicKey: string): Promise<string> {
    const p = new URLSearchParams({ accountId, publicKey });
    return this._http.get<string>(`/data/nonce?${p}`);
  }

  // ── Contract info ─────────────────────────────────────────────────────

  async getContractStatus(): Promise<ContractStatus> {
    return this._http.get<ContractStatus>(`/data/contract-status`);
  }

  async getVersion(): Promise<string> {
    return this._http.get<string>(`/data/version`);
  }

  /**
   * Read on-chain governance config (voting thresholds, periods, etc.).
   *
   * Prefer this over the legacy `getConfig()` name — `os.pages.getConfig()`
   * exists for page configuration and the disambiguated name avoids confusion.
   */
  async getGovernanceConfig(): Promise<GovernanceConfig> {
    return this._http.get<GovernanceConfig>(`/data/config`);
  }

  /**
   * @deprecated Use `getGovernanceConfig()` — this name collides with
   * `os.pages.getConfig()`. Will be removed in v0.2.
   */
  async getConfig(): Promise<GovernanceConfig> {
    return this.getGovernanceConfig();
  }

  async getContractInfo(): Promise<ContractInfo> {
    return this._http.get<ContractInfo>(`/data/contract-info`);
  }

  async getWnearAccount(): Promise<string | null> {
    return this._http.get<string | null>(`/data/wnear-account`);
  }
}
