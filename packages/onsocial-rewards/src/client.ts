import type {
  OnSocialRewardsConfig,
  CreditRequest,
  ExecuteResponse,
  ClaimResponse,
  UserReward,
  UserAppReward,
  AppConfig,
  ContractInfo,
} from './types.js';

const DEFAULT_BASE_URL = 'https://api.onsocial.id';
const DEFAULT_CONTRACT = 'rewards.onsocial.near';
const DEFAULT_TIMEOUT = 30_000;

/**
 * OnSocial Rewards SDK — credit SOCIAL token rewards through the OnSocial relayer.
 *
 * @example
 * ```ts
 * import { OnSocialRewards } from '@onsocial/rewards';
 *
 * const rewards = new OnSocialRewards({
 *   apiKey: process.env.ONSOCIAL_API_KEY!,
 *   appId: 'my_telegram_bot',
 * });
 *
 * await rewards.credit({ accountId: 'alice.near', source: 'message' });
 * ```
 */
export class OnSocialRewards {
  private readonly apiKey: string;
  private readonly appId: string;
  private readonly baseUrl: string;
  private readonly contract: string;
  private readonly timeout: number;

  constructor(config: OnSocialRewardsConfig) {
    if (!config.apiKey) throw new Error('OnSocialRewards: apiKey is required');
    if (!config.appId) throw new Error('OnSocialRewards: appId is required');

    this.apiKey = config.apiKey;
    this.appId = config.appId;
    this.baseUrl = (config.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, '');
    this.contract = config.rewardsContract ?? DEFAULT_CONTRACT;
    this.timeout = config.timeout ?? DEFAULT_TIMEOUT;
  }

  // ── Write ──

  /** Credit a reward to a NEAR account. */
  async credit(req: CreditRequest): Promise<ExecuteResponse> {
    const body: Record<string, string> = {
      account_id: req.accountId,
      source: req.source,
    };
    if (req.amount) body.amount = req.amount;

    const res = await fetch(`${this.baseUrl}/v1/reward`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Api-Key': this.apiKey,
      },
      signal: AbortSignal.timeout(this.timeout),
      body: JSON.stringify(body),
    });

    return (await res.json()) as ExecuteResponse;
  }

  /**
   * Gasless claim of pending rewards for a NEAR account.
   * Returns the amount claimed and the branded "powered_by" string.
   */
  async claim(accountId: string): Promise<ClaimResponse> {
    const res = await fetch(`${this.baseUrl}/v1/claim`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Api-Key': this.apiKey,
      },
      signal: AbortSignal.timeout(this.timeout),
      body: JSON.stringify({ account_id: accountId }),
    });

    return (await res.json()) as ClaimResponse;
  }

  /**
   * Returns a branding string for display in partner UIs.
   * @example badge('Acme Community') → '🤝 OnSocial stands with Acme Community'
   */
  badge(partnerName?: string): string {
    return partnerName ? `🤝 OnSocial stands with ${partnerName}` : '';
  }

  // ── Views (read-only, direct RPC) ──

  /** Get a user's global reward state. */
  async getUserReward(accountId: string): Promise<UserReward | null> {
    return this.view<UserReward | null>('get_user_reward', {
      account_id: accountId,
    });
  }

  /** Get a user's per-app reward state via the backend API. */
  async getUserAppReward(accountId: string): Promise<UserAppReward | null> {
    const res = await fetch(
      `${this.baseUrl}/v1/balance/${encodeURIComponent(accountId)}`,
      {
        headers: { 'X-Api-Key': this.apiKey },
        signal: AbortSignal.timeout(this.timeout),
      }
    );
    const data = (await res.json()) as {
      success: boolean;
      app_reward: UserAppReward | null;
    };
    return data.app_reward;
  }

  /** Get claimable balance in yocto-SOCIAL via the backend API. */
  async getClaimable(accountId: string): Promise<string> {
    const res = await fetch(
      `${this.baseUrl}/v1/balance/${encodeURIComponent(accountId)}`,
      {
        headers: { 'X-Api-Key': this.apiKey },
        signal: AbortSignal.timeout(this.timeout),
      }
    );
    const data = (await res.json()) as { success: boolean; claimable: string };
    return data.claimable;
  }

  /** Get this app's on-chain configuration via the backend API. */
  async getAppConfig(): Promise<AppConfig | null> {
    const res = await fetch(`${this.baseUrl}/v1/app`, {
      headers: { 'X-Api-Key': this.apiKey },
      signal: AbortSignal.timeout(this.timeout),
    });
    const data = (await res.json()) as {
      success: boolean;
      config: AppConfig | null;
    };
    return data.config;
  }

  /** Get contract-level info (pool balance, totals, registered apps). */
  async getContractInfo(): Promise<ContractInfo> {
    return this.view<ContractInfo>('get_contract_info', {});
  }

  // ── Internal ──

  private async view<T>(
    method: string,
    args: Record<string, string>
  ): Promise<T> {
    // Use the NEAR RPC directly to call view functions (no gas, no signing).
    // Detect network from the contract account suffix, not the relayer URL.
    const rpcUrl = this.contract.endsWith('.testnet')
      ? 'https://rpc.testnet.near.org'
      : 'https://rpc.mainnet.near.org';

    const res = await fetch(rpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(this.timeout),
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: '1',
        method: 'query',
        params: {
          request_type: 'call_function',
          finality: 'final',
          account_id: this.contract,
          method_name: method,
          args_base64: btoa(JSON.stringify(args)),
        },
      }),
    });

    const rpc = (await res.json()) as {
      result?: { result?: number[] };
      error?: unknown;
    };

    if (!rpc.result?.result) return null as T;
    const decoded = new TextDecoder().decode(new Uint8Array(rpc.result.result));
    return JSON.parse(decoded) as T;
  }
}
