// ---------------------------------------------------------------------------
// OnSocial SDK — domain error classes for storage-account operations.
//
// These wrap the generic `OnSocialError` / `RelayExecutionError` thrown by
// the HTTP layer so app code can react to specific failure modes without
// pattern-matching on error strings.
// ---------------------------------------------------------------------------

import type { NearAmount } from './near-amount.js';

/** Base class for storage-account domain errors. */
export class StorageAccountError extends Error {
  readonly code: string = 'STORAGE_ACCOUNT_ERROR';
  constructor(
    message: string,
    public readonly cause?: unknown
  ) {
    super(message);
    this.name = 'StorageAccountError';
  }
}

/** Thrown when a write requires a deposit and the account lacks balance. */
export class InsufficientStorageBalanceError extends StorageAccountError {
  readonly code = 'INSUFFICIENT_STORAGE_BALANCE' as const;
  constructor(
    message: string,
    public readonly accountId: string | undefined,
    public readonly available: NearAmount | undefined,
    public readonly requested: NearAmount | undefined,
    cause?: unknown
  ) {
    super(message, cause);
    this.name = 'InsufficientStorageBalanceError';
  }
}

/** Thrown when a method requires an attached deposit but no signer was configured. */
export class SignerRequiredError extends StorageAccountError {
  readonly code = 'SIGNER_REQUIRED' as const;
  /**
   * Action payload the caller can hand to any wallet adapter (MyNearWallet,
   * Meteor, Sender, HERE, etc.) to complete the deposit-funded operation.
   */
  readonly payload: {
    receiverId: string;
    methodName: 'execute';
    args: Record<string, unknown>;
    deposit: NearAmount;
    /** Suggested gas in yocto. */
    gas: string;
  };
  constructor(
    message: string,
    payload: SignerRequiredError['payload'],
    cause?: unknown
  ) {
    super(message, cause);
    this.name = 'SignerRequiredError';
    this.payload = payload;
  }
}

/** Thrown when an actor lacks permission for a write. */
export class PermissionDeniedError extends StorageAccountError {
  readonly code = 'PERMISSION_DENIED' as const;
  constructor(message: string, cause?: unknown) {
    super(message, cause);
    this.name = 'PermissionDeniedError';
  }
}
