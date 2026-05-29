// Session grant and delegate helpers.

import {
  PERMISSION_LEVEL,
  buildSetKeyPermissionAction,
  resolveContractId,
  type CoreAction,
  type ContractName,
} from './actions.js';
import type { Network } from '../types.js';
import type { SessionKey } from './session-key.js';
import { buildSignedDelegate, type DelegateInnerAction } from './nep366.js';
import type { KeyStore, StoredSession } from './session-store.js';

export interface SessionOnboardingInput {
  sessionPublicKey: string;
  scope: string;
  ttlMs: number;
  storageDepositYocto: string;
  level?: number;
  now?: number;
}

/** Builds the `execute_admin` actions needed to grant a session key. */
export function buildSessionOnboardingActions(
  opts: SessionOnboardingInput
): CoreAction[] {
  const now = opts.now ?? Date.now();
  const actions: CoreAction[] = [];

  if (opts.storageDepositYocto && opts.storageDepositYocto !== '0') {
    actions.push({
      type: 'set',
      data: { 'storage/deposit': { amount: opts.storageDepositYocto } },
    });
  }

  actions.push(
    buildSetKeyPermissionAction({
      publicKey: opts.sessionPublicKey,
      path: opts.scope,
      level: opts.level ?? PERMISSION_LEVEL.WRITE,
      expiresAtMs: now + opts.ttlMs,
    })
  );

  return actions;
}

export type SessionContract = Extract<
  ContractName,
  'core' | 'scarces' | 'rewards' | 'token'
>;

/** Native FunctionCall access key limits. */
export interface FunctionCallKeyLimits {
  allowanceYocto: string | null;
  methodNames?: string[];
}

export interface BuildSessionGrantInput {
  network: Network;
  accountId: string;
  sessionPublicKey: string;
  contract: SessionContract;
  contractId?: string;
  functionCallKey: FunctionCallKeyLimits;
  path?: string;
  ttlMs?: number;
  storageDepositYocto?: string;
  level?: number;
  now?: number;
  /**
   * Escape hatch — allow `execute_admin` in `functionCallKey.methodNames`.
   *
   * By default `buildSessionGrant` rejects this scope because admin actions
   * (`set_permission`, `set_key_permission`) require FullAccess on the
   * signing key (the contract enforces this in `execute_admin` via
   * `requires_full_access()`). A FunctionCall key listing `execute_admin`
   * is therefore always rejected by the runtime — useless and misleading.
   *
   * Set `true` only for tests or advanced flows where you understand the
   * key cannot actually invoke admin entrypoints.
   */
  allowAdminMethodScope?: boolean;
}

export interface OnboardingPlan {
  accountId: string;
  receiverId: string;
  publicKey: string;
  accessKey: {
    permission: 'FunctionCall';
    receiverId: string;
    methodNames: string[];
    allowanceYocto: string | null;
  };
  coreActions: CoreAction[];
  expiresAtMs?: number;
}

export class SessionScopeError extends Error {
  readonly code = 'SESSION_SCOPE_ERROR' as const;
  constructor(message: string) {
    super(message);
    this.name = 'SessionScopeError';
  }
}

/** Thrown when the next action must fall back to a wallet-signed flow. */
export class NeedsWalletConfirmationError extends Error {
  readonly code = 'NEEDS_WALLET_CONFIRMATION' as const;
  constructor(
    message: string,
    public readonly reason:
      | 'allowance_exceeded'
      | 'wrong_receiver'
      | 'wrong_method'
      | 'session_expired'
      | 'attached_deposit_required'
      | 'value_deposit_required'
  ) {
    super(message);
    this.name = 'NeedsWalletConfirmationError';
  }
}

/** Builds the wallet-side grant plan for a session key. */
export function buildSessionGrant(
  input: BuildSessionGrantInput
): OnboardingPlan {
  const receiverId =
    input.contractId ?? resolveContractId(input.network, input.contract);
  if (!receiverId) {
    throw new SessionScopeError(`Unknown contract ${input.contract}`);
  }

  const methodNames = input.functionCallKey.methodNames ?? ['execute'];
  const allowanceYocto = input.functionCallKey.allowanceYocto;

  if (!input.allowAdminMethodScope && methodNames.includes('execute_admin')) {
    throw new SessionScopeError(
      `Session FunctionCall keys cannot meaningfully scope to "execute_admin": ` +
        `the contract gates that entrypoint with FullAccess, so the NEAR runtime ` +
        `will reject any session-key call to it. Drop "execute_admin" from ` +
        `methodNames and route admin actions through a wallet-signed transaction ` +
        `(e.g. OnSocial { defaultBroadcast: { kind: 'wallet', signer } }), or ` +
        `set { allowAdminMethodScope: true } if you really intend a non-functional ` +
        `placeholder scope.`
    );
  }

  const coreActions: CoreAction[] = [];
  let expiresAtMs: number | undefined;

  if (input.contract === 'core') {
    if (!input.path) {
      throw new SessionScopeError(
        'core sessions require a `path` scope (e.g. "apps/myapp/")'
      );
    }
    const ttl = input.ttlMs ?? 24 * 60 * 60 * 1000;
    expiresAtMs = (input.now ?? Date.now()) + ttl;
    coreActions.push(
      ...buildSessionOnboardingActions({
        sessionPublicKey: input.sessionPublicKey,
        scope: input.path,
        ttlMs: ttl,
        storageDepositYocto: input.storageDepositYocto ?? '0',
        level: input.level ?? PERMISSION_LEVEL.WRITE,
        now: input.now,
      })
    );
  } else if (
    input.path ||
    input.ttlMs ||
    input.storageDepositYocto ||
    input.level
  ) {
    throw new SessionScopeError(
      `path/ttlMs/storageDepositYocto/level only apply to contract === "core" (got "${input.contract}"). ` +
        `For ${input.contract}, scope is enforced by on-chain ownership + the strict-key gate. ` +
        `Use the FunctionCall allowance for value bounds.`
    );
  }

  return {
    accountId: input.accountId,
    receiverId,
    publicKey: input.sessionPublicKey,
    accessKey: {
      permission: 'FunctionCall',
      receiverId,
      methodNames,
      allowanceYocto,
    },
    coreActions,
    expiresAtMs,
  };
}

export interface SessionPersistence {
  store: KeyStore;
  sessionId: string;
}

export interface SessionConfig {
  network: Network;
  accountId: string;
  contract: SessionContract;
  contractId?: string;
  key: SessionKey;
  startingNonce?: number;
  defaultTtlMs?: number;
  remainingAllowanceYocto?: string | null;
  gasTgas?: number;
  depositYocto?: string;
  /** True only when the delegate signer key is known to be FullAccess. */
  canAttachDeposit?: boolean;
  /** Persist successful relay nonces into the session KeyStore. */
  persistence?: SessionPersistence;
}

/** Stateful helper for one `(account, contract, key)` tuple. */
export class Session {
  readonly accountId: string;
  readonly contract: SessionContract;
  readonly contractId: string;
  readonly key: SessionKey;
  readonly network: Network;

  private nonce: number;
  private readonly defaultTtlMs: number;
  private remainingAllowance: bigint | null;
  private readonly gasTgas: number;
  private readonly depositYocto: string;
  private readonly canAttachDeposit: boolean;
  private readonly persistence?: SessionPersistence;

  constructor(cfg: SessionConfig) {
    const resolved =
      cfg.contractId ?? resolveContractId(cfg.network, cfg.contract);
    if (!resolved) {
      throw new SessionScopeError(`Unknown contract ${cfg.contract}`);
    }
    this.accountId = cfg.accountId;
    this.network = cfg.network;
    this.contract = cfg.contract;
    this.contractId = resolved;
    this.key = cfg.key;
    this.persistence = cfg.persistence;
    this.gasTgas = cfg.gasTgas ?? 100;
    this.depositYocto = cfg.depositYocto ?? '0';
    this.canAttachDeposit = cfg.canAttachDeposit ?? false;
    this.nonce = cfg.startingNonce ?? 1;
    this.defaultTtlMs = cfg.defaultTtlMs ?? 5 * 60 * 1000;
    this.remainingAllowance =
      cfg.remainingAllowanceYocto === null ||
      cfg.remainingAllowanceYocto === undefined
        ? null
        : BigInt(cfg.remainingAllowanceYocto);
  }

  get currentNonce(): number {
    return this.nonce;
  }

  get allowanceYocto(): string | null {
    return this.remainingAllowance === null
      ? null
      : this.remainingAllowance.toString();
  }

  get ttlMs(): number {
    return this.defaultTtlMs;
  }

  get supportsAttachedDeposit(): boolean {
    return this.canAttachDeposit;
  }

  /** Ensure the next delegate nonce is above NEAR's block-height access-key floor. */
  ensureNonceAboveAccessKeyFloor(
    latestBlockHeight: bigint | number | string
  ): void {
    const floor = BigInt(latestBlockHeight) * 1_000_000n;
    const next = floor + 1n;
    if (next > BigInt(Number.MAX_SAFE_INTEGER)) {
      throw new SessionScopeError(
        `computed delegate nonce ${next.toString()} exceeds JavaScript safe integer range`
      );
    }
    const nextNumber = Number(next);
    if (this.nonce < nextNumber) {
      this.nonce = nextNumber;
    }
  }

  /** Signs a delegate for one or more inner actions and advances the nonce. */
  async signDelegate(
    actions: DelegateInnerAction[],
    opts: {
      maxBlockHeight: bigint | string;
      receiverId?: string;
    }
  ): Promise<{ base64: string; nonce: number }> {
    const nonce = this.nonce++;
    const { base64 } = await buildSignedDelegate({
      senderId: this.accountId,
      receiverId: opts.receiverId ?? this.contractId,
      actions,
      nonce: BigInt(nonce),
      maxBlockHeight: opts.maxBlockHeight,
      sessionPublicKey: this.key.publicKey,
      sign: this.key.sign,
    });
    return { base64, nonce };
  }

  /** Wraps a single `execute(request)` (or `execute_admin`) call in a delegate. */
  async signComposeDelegate(opts: {
    action: Record<string, unknown>;
    targetContract?: string;
    targetAccount?: string;
    requestOptions?: Record<string, unknown>;
    maxBlockHeight: bigint | string;
    /** Override the inner FunctionCall method. Defaults to `execute`. */
    methodName?: string;
    /** Override the inner FunctionCall attached deposit for this call. */
    depositYocto?: bigint | string;
  }): Promise<{ base64: string; nonce: number }> {
    const receiverId = opts.targetContract ?? this.contractId;
    const request: Record<string, unknown> = { action: opts.action };
    if (opts.targetAccount !== undefined) {
      request.target_account = opts.targetAccount;
    }
    if (opts.requestOptions !== undefined) {
      request.options = opts.requestOptions;
    }
    const deposit = BigInt(opts.depositYocto ?? this.depositYocto);
    if (deposit > 0n && !this.canAttachDeposit) {
      throw new NeedsWalletConfirmationError(
        'attached deposits require a FullAccess delegate signer or wallet confirmation',
        'attached_deposit_required'
      );
    }

    const inner: DelegateInnerAction = {
      type: 'FunctionCall',
      methodName: opts.methodName ?? 'execute',
      args: new TextEncoder().encode(JSON.stringify({ request })),
      gas: BigInt(this.gasTgas) * 1_000_000_000_000n,
      deposit,
    };
    return this.signDelegate([inner], {
      maxBlockHeight: opts.maxBlockHeight,
      receiverId,
    });
  }

  /** Best-effort allowance debit against the local allowance hint. */
  debitAllowance(estimatedCostYocto: string): void {
    if (this.remainingAllowance === null) return;
    const cost = BigInt(estimatedCostYocto);
    if (cost > this.remainingAllowance) {
      throw new NeedsWalletConfirmationError(
        `estimated cost ${cost} > remaining allowance ${this.remainingAllowance}`,
        'allowance_exceeded'
      );
    }
    this.remainingAllowance -= cost;
  }

  rewindNonce(): void {
    this.nonce = Math.max(1, this.nonce - 1);
  }

  /** Force the next signed delegate to use this nonce (chain resync / retry). */
  forceNextNonce(nextNonce: number): void {
    if (!Number.isSafeInteger(nextNonce) || nextNonce < 1) {
      throw new SessionScopeError(`invalid delegate nonce: ${nextNonce}`);
    }
    this.nonce = nextNonce;
  }

  /** Record a successful on-chain delegate nonce in the session store. */
  async persistRelayNonce(usedNonce: number): Promise<void> {
    if (!this.persistence) return;
    const stored = await this.persistence.store.get(this.persistence.sessionId);
    if (!stored) return;
    const next: StoredSession = {
      ...stored,
      lastNonce: Math.max(stored.lastNonce, usedNonce),
    };
    await this.persistence.store.set(this.persistence.sessionId, next);
  }
}

/** Builds the revoke plan for a session key. */
export function buildSessionRevoke(input: {
  publicKey: string;
  contract: SessionContract;
  path?: string;
}): {
  publicKey: string;
  coreActions: CoreAction[];
} {
  const coreActions: CoreAction[] = [];
  if (input.contract === 'core') {
    if (!input.path) {
      throw new SessionScopeError(
        'core revoke requires the original `path` to clear the registry entry'
      );
    }
    coreActions.push({
      type: 'set_key_permission',
      public_key: input.publicKey,
      path: input.path,
      level: 0,
      expires_at: '0',
    });
  }
  return { publicKey: input.publicKey, coreActions };
}
