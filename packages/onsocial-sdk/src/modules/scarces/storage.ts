// ---------------------------------------------------------------------------
// Storage — per-account storage deposit / withdraw and platform-wide controls
// for the scarces contract. Mirrors the contract's `storage` namespace.
// ---------------------------------------------------------------------------

import type { HttpClient } from '../../internal/http.js';
import type { RelayResponse } from '../../types.js';
import {
  composeAndSign,
  type SessionGetter,
  type BroadcastGetter,
} from '../../internal/session-bridge.js';
import { SCARCES_VERBS } from './verbs.js';
import { scarcesRelayOptions } from './_relay.js';

export class ScarcesStorageApi {
  constructor(
    private _http: HttpClient,
    private _getSession: SessionGetter,
    private _getBroadcast?: BroadcastGetter
  ) {}

  private _relayOpts(opts?: { confirmation?: boolean; depositYocto?: string }) {
    return scarcesRelayOptions(this._getBroadcast, opts);
  }

  /**
   * Deposit NEAR into the caller's per-account storage balance on the
   * scarces contract. `amountNear` is the attached deposit (e.g. `'0.01'`).
  * Requires wallet broadcast because the default gateway relayer only
  * supports gas sponsorship and 1 yoctoNEAR confirmation deposits.
   *
   * ```ts
   * await os.scarces.storage.deposit('0.01');
   * ```
   */
  async deposit(
    amountNear: string,
    accountId?: string
  ): Promise<RelayResponse> {
    return composeAndSign(
      this._http,
      this._getSession(),
      SCARCES_VERBS.STORAGE_DEPOSIT,
      {
        amountNear,
        ...(accountId ? { accountId } : {}),
      },
      'scarces.storage.deposit',
      this._relayOpts({ depositYocto: nearToYocto(amountNear).toString() })
    );
  }

  /** Withdraw unused storage balance. Omit `amountNear` to withdraw all. */
  async withdraw(amountNear?: string): Promise<RelayResponse> {
    return composeAndSign(
      this._http,
      this._getSession(),
      SCARCES_VERBS.STORAGE_WITHDRAW,
      amountNear !== undefined ? { amountNear } : {},
      'scarces.storage.withdraw',
      this._relayOpts({ confirmation: true })
    );
  }

  /**
   * Set a per-account spending cap (yoctoNEAR) on storage usage to bound
   * automatic deductions. Pass `null` to clear.
   */
  async setSpendingCap(amount: string | null): Promise<RelayResponse> {
    return composeAndSign(
      this._http,
      this._getSession(),
      SCARCES_VERBS.SET_SPENDING_CAP,
      { amount },
      'scarces.storage.setSpendingCap',
      this._relayOpts({ confirmation: true })
    );
  }

  /**
   * Withdraw from the contract's platform-wide storage pool (contract owner
   * only). Used to recover unallocated platform-funded storage.
   */
  async withdrawPlatformStorage(amountNear: string): Promise<RelayResponse> {
    return composeAndSign(
      this._http,
      this._getSession(),
      SCARCES_VERBS.WITHDRAW_PLATFORM_STORAGE,
      { amountNear },
      'scarces.storage.withdrawPlatformStorage',
      this._relayOpts({ confirmation: true })
    );
  }

  /**
   * Read the caller's (or any account's) current storage balance on the
   * scarces contract, in yoctoNEAR.
   *
   * ```ts
   * const yocto = await os.scarces.storage.balanceOf('alice.near');
   * ```
   */
  async balanceOf(accountId: string): Promise<string> {
    const params = new URLSearchParams({ accountId });
    const out = await this._http.get<string | { total?: string }>(
      `/data/scarces-storage-balance?${params}`
    );
    if (typeof out === 'string') return out;
    return out?.total ?? '0';
  }

  /**
   * Idempotent storage top-up. Reads the account's current scarces storage
   * balance and deposits enough NEAR to reach `minNear`. No-ops (returns
   * `null`) if the balance is already sufficient.
   *
   * Use before a user's first offer / bid / lazy-purchase to avoid
   * `StorageError` from the contract.
  * Requires wallet broadcast if a top-up is needed.
   *
   * ```ts
   * // Ensure ≥ 0.05 NEAR is on file before placing a first bid
   * await os.scarces.storage.ensure({ minNear: '0.05' });
   * ```
   */
  async ensure(opts: {
    minNear: string;
    accountId?: string;
  }): Promise<RelayResponse | null> {
    const accountId = opts.accountId ?? this._getSession()?.accountId;
    if (!accountId) {
      throw new Error(
        'scarces.storage.ensure: no accountId available — pass `accountId` or attach a session'
      );
    }
    const currentYocto = BigInt(await this.balanceOf(accountId));
    const minYocto = nearToYocto(opts.minNear);
    if (currentYocto >= minYocto) return null;
    const deltaYocto = minYocto - currentYocto;
    const deltaNear = yoctoToNear(deltaYocto);
    return this.deposit(deltaNear, opts.accountId);
  }
}

const YOCTO_PER_NEAR = 10n ** 24n;

function nearToYocto(near: string): bigint {
  const trimmed = near.trim();
  if (!/^\d+(\.\d+)?$/.test(trimmed)) {
    throw new Error(`Invalid NEAR amount: ${near}`);
  }
  const [whole, frac = ''] = trimmed.split('.');
  const fracPadded = (frac + '0'.repeat(24)).slice(0, 24);
  return BigInt(whole) * YOCTO_PER_NEAR + BigInt(fracPadded || '0');
}

function yoctoToNear(yocto: bigint): string {
  if (yocto <= 0n) return '0';
  const whole = yocto / YOCTO_PER_NEAR;
  const frac = yocto % YOCTO_PER_NEAR;
  if (frac === 0n) return whole.toString();
  const fracStr = frac.toString().padStart(24, '0').replace(/0+$/, '');
  return `${whole}.${fracStr}`;
}
