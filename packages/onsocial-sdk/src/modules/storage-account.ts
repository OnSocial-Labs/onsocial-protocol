// ---------------------------------------------------------------------------
// OnSocial SDK — storage-account module
//
// On-chain Storage record management: reads, gasless writes via the relayer,
// and deposit-funded writes that require a signer.
//
// The "100% works through the relayer" methods are first-class. Methods that
// require attached NEAR (deposit, fundPlatform, fundGroupPool, fundSharedPool)
// throw `SignerRequiredError` with a payload the caller can hand to any
// wallet adapter — completing the operation without the SDK shipping wallet
// integrations of its own.
// ---------------------------------------------------------------------------

import type { HttpClient } from '../http.js';
import { resolveContractId } from '../contracts.js';
import { NEAR, type NearAmount } from '../near-amount.js';
import { SignerRequiredError } from '../errors.js';
import type {
  OnChainStorageBalance,
  PlatformPoolInfo,
  PlatformAllowanceInfo,
  RelayResponse,
} from '../types.js';

/** Amount accepted as input — branded, plain string, number, or bigint. */
export type AmountInput = NearAmount | string | number | bigint;

/** Default gas attached to deposit-funded ops (300 TGas). */
const DEFAULT_DEPOSIT_GAS = '300000000000000';

/**
 * Optional per-call observability hook.
 *
 * Fired with `'submitted'` when the relayer accepts the request and
 * `'confirmed'` when the on-chain receipt is observed (only when the
 * relayer was called with `wait=true`, which is the default for writes
 * here so callers see real failures).
 */
export interface TxObserver {
  onSubmitted?: (tx: RelayResponse) => void;
  onConfirmed?: (tx: RelayResponse) => void;
}

/**
 * Options accepted by every gasless write — currently just observability.
 */
export type WriteOptions = TxObserver;

/**
 * Options for deposit-funded writes — accepts a signer for direct broadcast,
 * otherwise throws `SignerRequiredError` with the wallet-ready payload.
 */
export interface DepositWriteOptions extends WriteOptions {
  /** When provided, the SDK signs and broadcasts directly via the signer. */
  signer?: TransactionSigner;
}

/**
 * Minimal signer surface — kept tiny so any wallet adapter can implement it
 * without the SDK depending on `near-api-js`.
 */
export interface TransactionSigner {
  /** Sign and broadcast a function call to `receiverId`. */
  signAndSendTransaction(req: {
    receiverId: string;
    methodName: 'execute';
    args: Record<string, unknown>;
    deposit: NearAmount;
    gas: string;
  }): Promise<RelayResponse>;
}

function toAmount(input: AmountInput): NearAmount {
  return typeof input === 'string' && /^[0-9]+$/.test(input)
    ? // already yocto
      NEAR.fromYocto(input)
    : NEAR(input as string | number | bigint);
}

/**
 * Storage account module — on-chain Storage record operations.
 *
 * **Reads** are pure HTTP view calls.
 *
 * **Gasless writes** (`withdraw`, `tip`, `sponsor`, `unsponsor`,
 *  `setSponsorQuota`, `setSponsorDefault`) go through the relayer with
 *  `wait=true` so on-chain reverts surface as `RelayExecutionError` rather
 *  than silently succeeding.
 *
 * **Deposit-funded writes** (`deposit`, `fundPlatform`, `fundGroupPool`,
 *  `fundSharedPool`) require a `signer` — either configured per call via
 *  `opts.signer` or once on the client config. Without a signer they throw
 *  `SignerRequiredError` carrying a wallet-ready payload.
 *
 * ```ts
 * import { OnSocial, NEAR } from '@onsocial/sdk';
 *
 * const os = new OnSocial({ network: 'testnet' });
 *
 * // Reads
 * const me = await os.storageAccount.balance();
 * const alice = await os.storageAccount.balance('alice.testnet');
 * const pool = await os.storageAccount.groupPool('cool-cats');
 *
 * // Gasless writes (relayer)
 * await os.storageAccount.withdraw(NEAR('0.05'));
 * await os.storageAccount.tip('bob.testnet', NEAR('0.001'));
 * await os.storageAccount.sponsor('bob.testnet', { maxBytes: 4096 });
 *
 * // Deposit-funded writes (signer required)
 * try {
 *   await os.storageAccount.deposit(NEAR('0.1'));
 * } catch (e) {
 *   if (e instanceof SignerRequiredError) {
 *     await wallet.signAndSendTransaction(e.payload);
 *   }
 * }
 * ```
 */
export class StorageAccountModule {
  private readonly _coreContract: string;

  constructor(
    private readonly _http: HttpClient,
    private readonly _defaultSigner?: TransactionSigner
  ) {
    this._coreContract = resolveContractId(_http.network, 'core');
  }

  // ── Reads ─────────────────────────────────────────────────────────────

  /** On-chain storage record for an account (defaults to caller). */
  async balance(accountId?: string): Promise<OnChainStorageBalance | null> {
    const account = accountId ?? this._http.actorId;
    if (!account) {
      throw new Error(
        'storageAccount.balance() requires accountId — no actor configured'
      );
    }
    const p = new URLSearchParams({ accountId: account });
    return this._http.get<OnChainStorageBalance | null>(
      `/data/storage-balance?${p}`
    );
  }

  /** Platform-wide shared storage pool. */
  async platformPool(): Promise<PlatformPoolInfo | null> {
    return this._http.get<PlatformPoolInfo | null>(`/data/platform-pool`);
  }

  /** A group's storage pool. */
  async groupPool(groupId: string): Promise<Record<string, unknown> | null> {
    const p = new URLSearchParams({ groupId });
    return this._http.get<Record<string, unknown> | null>(
      `/data/group-pool?${p}`
    );
  }

  /** A user-owned shared pool. */
  async sharedPool(poolId: string): Promise<Record<string, unknown> | null> {
    const p = new URLSearchParams({ poolId });
    return this._http.get<Record<string, unknown> | null>(
      `/data/shared-pool?${p}`
    );
  }

  /** Platform-sponsored byte allowance for an account. */
  async platformAllowance(accountId: string): Promise<PlatformAllowanceInfo> {
    const p = new URLSearchParams({ accountId });
    return this._http.get<PlatformAllowanceInfo>(
      `/data/platform-allowance?${p}`
    );
  }

  /**
   * Sponsorship the given account currently *receives* (the `shared_storage`
   * field on its Storage record). Returns `null` when not sponsored.
   *
   * Note: listing sponsorships an account *grants* is not available without
   * an indexer scan and is intentionally omitted here.
   */
  async sponsorshipReceived(
    accountId?: string
  ): Promise<OnChainStorageBalance['shared_storage'] | null> {
    const balance = await this.balance(accountId);
    return balance?.shared_storage ?? null;
  }

  // ── Gasless writes (relayer) ──────────────────────────────────────────

  /**
   * Withdraw available balance to the caller. Omit `amount` to withdraw all
   * available (after locked balance and storage coverage).
   */
  withdraw(amount?: AmountInput, opts?: WriteOptions): Promise<RelayResponse> {
    const data: Record<string, unknown> = {};
    if (amount !== undefined) data.amount = toAmount(amount);
    return this._gaslessSet('storage/withdraw', data, opts);
  }

  /** Move balance from caller's storage record to another account's. */
  tip(
    targetId: string,
    amount: AmountInput,
    opts?: WriteOptions
  ): Promise<RelayResponse> {
    return this._gaslessSet(
      'storage/tip',
      { target_id: targetId, amount: toAmount(amount) },
      opts
    );
  }

  /**
   * Reserve `maxBytes` of caller's storage record for `targetId` so they can
   * write under a sponsored allocation.
   */
  sponsor(
    targetId: string,
    args: { maxBytes: number },
    opts?: WriteOptions
  ): Promise<RelayResponse> {
    return this._gaslessSet(
      'storage/share_storage',
      { target_id: targetId, max_bytes: args.maxBytes },
      opts
    );
  }

  /** Release the caller's currently received sponsorship allocation. */
  unsponsor(opts?: WriteOptions): Promise<RelayResponse> {
    return this._gaslessSet('storage/return_shared_storage', {}, opts);
  }

  /**
   * Set per-target sponsor quota for a group. Caller must be group owner
   * or hold `manage` permission.
   */
  setSponsorQuota(
    groupId: string,
    targetId: string,
    args: {
      enabled: boolean;
      dailyRefillBytes: number;
      allowanceMaxBytes: number;
    },
    opts?: WriteOptions
  ): Promise<RelayResponse> {
    return this._gaslessSet(
      'storage/group_sponsor_quota_set',
      {
        group_id: groupId,
        target_id: targetId,
        enabled: args.enabled,
        daily_refill_bytes: args.dailyRefillBytes,
        allowance_max_bytes: args.allowanceMaxBytes,
      },
      opts
    );
  }

  /** Set group's default sponsor configuration applied to members without override. */
  setSponsorDefault(
    groupId: string,
    args: {
      enabled: boolean;
      dailyRefillBytes: number;
      allowanceMaxBytes: number;
    },
    opts?: WriteOptions
  ): Promise<RelayResponse> {
    return this._gaslessSet(
      'storage/group_sponsor_default_set',
      {
        group_id: groupId,
        enabled: args.enabled,
        daily_refill_bytes: args.dailyRefillBytes,
        allowance_max_bytes: args.allowanceMaxBytes,
      },
      opts
    );
  }

  // ── Deposit-funded writes (signer required) ───────────────────────────

  /** Deposit NEAR into caller's storage record. Requires signer. */
  deposit(
    amount: AmountInput,
    opts?: DepositWriteOptions
  ): Promise<RelayResponse> {
    const yocto = toAmount(amount);
    return this._depositSet('storage/deposit', { amount: yocto }, yocto, opts);
  }

  /** Fund the platform-wide shared storage pool. Requires signer. */
  fundPlatform(
    amount: AmountInput,
    opts?: DepositWriteOptions
  ): Promise<RelayResponse> {
    const yocto = toAmount(amount);
    return this._depositSet(
      'storage/platform_pool_deposit',
      { amount: yocto },
      yocto,
      opts
    );
  }

  /**
   * Fund a group's shared storage pool. Caller must be group owner or hold
   * `manage` permission. Requires signer.
   */
  fundGroupPool(
    groupId: string,
    amount: AmountInput,
    opts?: DepositWriteOptions
  ): Promise<RelayResponse> {
    const yocto = toAmount(amount);
    return this._depositSet(
      'storage/group_pool_deposit',
      { group_id: groupId, amount: yocto },
      yocto,
      opts
    );
  }

  /**
   * Fund a user-owned shared storage pool. The caller must own the pool
   * (`pool_id == actor`). Requires signer.
   */
  fundSharedPool(
    poolId: string,
    amount: AmountInput,
    opts?: DepositWriteOptions
  ): Promise<RelayResponse> {
    const yocto = toAmount(amount);
    return this._depositSet(
      'storage/shared_pool_deposit',
      { pool_id: poolId, amount: yocto },
      yocto,
      opts
    );
  }

  // ── Internals ─────────────────────────────────────────────────────────

  private async _gaslessSet(
    storagePath: string,
    value: Record<string, unknown>,
    opts?: WriteOptions
  ): Promise<RelayResponse> {
    const action = { type: 'set', data: { [storagePath]: value } };
    const tx = await this._http.post<RelayResponse>(
      '/relay/execute?wait=true',
      { action, target_account: this._coreContract }
    );
    opts?.onSubmitted?.(tx);
    opts?.onConfirmed?.(tx);
    return tx;
  }

  private async _depositSet(
    storagePath: string,
    value: Record<string, unknown>,
    deposit: NearAmount,
    opts?: DepositWriteOptions
  ): Promise<RelayResponse> {
    const action = { type: 'set', data: { [storagePath]: value } };
    const args = { request: { action } };

    const signer = opts?.signer ?? this._defaultSigner;
    if (!signer) {
      throw new SignerRequiredError(
        `${storagePath} requires an attached deposit and cannot be relayed gasless. ` +
          `Configure a signer on the OnSocial client or pass { signer } to this call. ` +
          `The wallet-ready payload is on err.payload.`,
        {
          receiverId: this._coreContract,
          methodName: 'execute',
          args,
          deposit,
          gas: DEFAULT_DEPOSIT_GAS,
        }
      );
    }

    const tx = await signer.signAndSendTransaction({
      receiverId: this._coreContract,
      methodName: 'execute',
      args,
      deposit,
      gas: DEFAULT_DEPOSIT_GAS,
    });
    opts?.onSubmitted?.(tx);
    opts?.onConfirmed?.(tx);
    return tx;
  }
}
