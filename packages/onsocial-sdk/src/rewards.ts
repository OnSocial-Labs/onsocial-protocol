// ---------------------------------------------------------------------------
// OnSocial SDK — rewards module
// ---------------------------------------------------------------------------

import type { HttpClient } from './http.js';
import type {
  ClaimResponse,
  CreditRequest,
  CreditResponse,
  RewardBalance,
  RelayResponse,
} from './types.js';

export class RewardsModule {
  constructor(private _http: HttpClient) {}

  /**
   * Credit a reward to an account (requires API key or authorized caller).
   *
   * ```ts
   * await os.rewards.credit({ accountId: 'alice.near', amount: '1000000' });
   * ```
   */
  async credit(req: CreditRequest): Promise<CreditResponse> {
    return this._http.post<CreditResponse>('/v1/reward', req);
  }

  /**
   * Gasless claim of pending rewards for the given account.
   *
   * ```ts
   * const { claimed } = await os.rewards.claim('alice.near');
   * ```
   */
  async claim(accountId: string): Promise<ClaimResponse> {
    return this._http.post<ClaimResponse>('/v1/claim', { accountId });
  }

  /** Get reward balance and stats for an account. */
  async getBalance(accountId: string): Promise<RewardBalance> {
    return this._http.get<RewardBalance>(`/v1/balance/${encodeURIComponent(accountId)}`);
  }

  /** Get the app's on-chain reward configuration. */
  async getAppConfig(): Promise<Record<string, unknown>> {
    return this._http.get<Record<string, unknown>>('/v1/app');
  }
}
