import {
  decodeDmPublicKey,
  decodeDmSecretKey,
  dmKeysEqual,
  encodeDmPublicKey,
  encodeDmSecretKey,
  generateDmKeyPair,
  generateDmRecoveryCode,
  publicKeyFromSecretKey,
  recoveryCodeToWrapKey,
  unwrapDmSecretKey,
  wrapDmSecretKey,
  type DmKeyPair,
} from '@/lib/dm/crypto';
import {
  enrollDmPasskey,
  isDmPasskeySupported,
  unlockDmPasskey,
} from '@/lib/dm/passkey';
import type { DmKeyBackup, DmLookupResult } from '@/lib/dm/pubkey';

const STORE_PREFIX = 'onsocial.app.dm.';

/** In-tab unlocked secrets — preferred when passkey enroll clears disk secret. */
const memorySecrets = new Map<string, string>();

/** In-process bootstrap serialization (same tab / concurrent callers). */
const bootstrapInflight = new Map<string, Promise<EnsureDmKeysResult>>();

export type StoredDmIdentity = {
  accountId: string;
  publicKey: string;
  /** Local unwrapped secret — legacy / until passkey enroll. */
  secretKey?: string;
  /** Recovery-wrapped secret for restore (also published to social). */
  wrapped?: { ciphertext: string; nonce: string };
  /** Device passkey-wrapped secret (local only). */
  passkeyWrapped?: {
    ciphertext: string;
    nonce: string;
    credentialId: string;
  };
  createdAt: string;
  /** Set only after the user acknowledges the recovery sheet. */
  recoveryCodeShownAt?: string;
  /**
   * Plaintext recovery code kept until acknowledgement so a failed first
   * send/publish cannot permanently lose it. Cleared by {@link acknowledgeDmRecoveryCode}.
   */
  pendingRecoveryCode?: string;
};

export class DmKeysLockedError extends Error {
  constructor(
    message = 'Messages are locked on this device. Enter your recovery code to unlock.'
  ) {
    super(message);
    this.name = 'DmKeysLockedError';
  }
}

export class DmKeysUnavailableError extends Error {
  constructor(
    message = 'Could not verify messaging keys. Check your connection and try again.'
  ) {
    super(message);
    this.name = 'DmKeysUnavailableError';
  }
}

export class DmKeysMismatchError extends Error {
  constructor(
    message = 'This device’s messaging keys do not match your profile. Unlock with your recovery code before continuing.'
  ) {
    super(message);
    this.name = 'DmKeysMismatchError';
  }
}

function storageKey(accountId: string): string {
  return `${STORE_PREFIX}${accountId.trim().toLowerCase()}`;
}

function readStore(accountId: string): StoredDmIdentity | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(storageKey(accountId));
    if (!raw) return null;
    return JSON.parse(raw) as StoredDmIdentity;
  } catch {
    return null;
  }
}

function writeStore(identity: StoredDmIdentity): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(
    storageKey(identity.accountId),
    JSON.stringify(identity)
  );
}

function setMemorySecret(accountId: string, secretKeyEncoded: string): void {
  memorySecrets.set(accountId.trim().toLowerCase(), secretKeyEncoded);
}

function clearMemorySecret(accountId: string): void {
  memorySecrets.delete(accountId.trim().toLowerCase());
}

function assertDerivedPublicKey(
  publicKey: Uint8Array,
  secretKey: Uint8Array
): void {
  const derived = publicKeyFromSecretKey(secretKey);
  if (!dmKeysEqual(derived, publicKey)) {
    throw new DmKeysMismatchError(
      'Messaging key material is inconsistent on this device.'
    );
  }
}

/** Test helper — clear in-tab secrets between unit tests. */
export function __resetDmKeyMemoryForTests(): void {
  memorySecrets.clear();
  bootstrapInflight.clear();
}

export function getStoredDmIdentity(
  accountId: string
): StoredDmIdentity | null {
  return readStore(accountId);
}

export function hasUnlockedDmKey(accountId: string): boolean {
  return loadDmKeyPair(accountId) != null;
}

export function hasDmPasskeyEnrolled(accountId: string): boolean {
  const stored = readStore(accountId);
  return Boolean(stored?.passkeyWrapped?.credentialId);
}

export function canOfferDmPasskey(): boolean {
  return isDmPasskeySupported();
}

export function loadDmKeyPair(accountId: string): DmKeyPair | null {
  const id = accountId.trim().toLowerCase();
  const stored = readStore(id);
  if (!stored?.publicKey) return null;
  const fromMemory = memorySecrets.get(id);
  const secretEncoded = fromMemory ?? stored.secretKey;
  if (!secretEncoded) return null;
  try {
    const publicKey = decodeDmPublicKey(stored.publicKey);
    const secretKey = decodeDmSecretKey(secretEncoded);
    assertDerivedPublicKey(publicKey, secretKey);
    return { publicKey, secretKey };
  } catch {
    return null;
  }
}

/** Local wrap backup for publishing / restore, if present. */
export function getLocalDmKeyBackup(accountId: string): DmKeyBackup | null {
  const stored = readStore(accountId);
  if (!stored?.wrapped || !stored.publicKey) return null;
  return {
    publicKey: stored.publicKey,
    wrapped: stored.wrapped,
  };
}

/**
 * Persist a remote wrap without unlocking — unlock UI can work offline next.
 * Never overwrites an unlocked local secret.
 * Clears passkey wrap when the remote identity differs.
 */
export function seedDmKeyBackupFromRemote(
  accountId: string,
  remote: DmKeyBackup
): void {
  const id = accountId.trim().toLowerCase();
  if (loadDmKeyPair(id)) return;
  const existing = readStore(id);
  const sameIdentity = existing?.publicKey === remote.publicKey;
  writeStore({
    accountId: id,
    publicKey: remote.publicKey,
    wrapped: remote.wrapped,
    passkeyWrapped: sameIdentity ? existing?.passkeyWrapped : undefined,
    createdAt: existing?.createdAt ?? new Date().toISOString(),
    recoveryCodeShownAt: sameIdentity
      ? existing?.recoveryCodeShownAt
      : undefined,
    pendingRecoveryCode: sameIdentity
      ? existing?.pendingRecoveryCode
      : undefined,
  });
}

/** Clear pending recovery plaintext after the user acknowledges the sheet. */
export function acknowledgeDmRecoveryCode(accountId: string): void {
  const id = accountId.trim().toLowerCase();
  const stored = readStore(id);
  if (!stored?.pendingRecoveryCode) return;
  writeStore({
    ...stored,
    pendingRecoveryCode: undefined,
    recoveryCodeShownAt: new Date().toISOString(),
  });
}

export function peekPendingDmRecoveryCode(accountId: string): string | null {
  return readStore(accountId)?.pendingRecoveryCode?.trim() || null;
}

export type EnsureDmKeysResult = {
  keyPair: DmKeyPair;
  publicKeyEncoded: string;
  /** Present when keys were just created, or pending acknowledgement remains. */
  recoveryCode: string | null;
  created: boolean;
  backup: DmKeyBackup | null;
};

export type EnsureDmKeysOptions = {
  /**
   * Tri-state remote wrap lookup. Prefer this over a bare backup object so
   * transport failures cannot be mistaken for absence.
   */
  remote?: DmLookupResult<DmKeyBackup>;
  /** @deprecated Prefer `remote`. Treated as found when non-null, absent when null. */
  remoteBackup?: DmKeyBackup | null;
};

function resolveRemoteOption(
  opts?: EnsureDmKeysOptions
): DmLookupResult<DmKeyBackup> | undefined {
  if (opts?.remote) return opts.remote;
  if (opts && 'remoteBackup' in opts) {
    return opts.remoteBackup
      ? { status: 'found', value: opts.remoteBackup }
      : { status: 'absent' };
  }
  return undefined;
}

async function withBootstrapLock<T>(
  accountId: string,
  run: () => Promise<T>
): Promise<T> {
  const id = accountId.trim().toLowerCase();
  const locks =
    typeof navigator !== 'undefined'
      ? (
          navigator as Navigator & {
            locks?: {
              request: <R>(name: string, cb: () => Promise<R>) => Promise<R>;
            };
          }
        ).locks
      : undefined;
  if (locks?.request) {
    return locks.request(`onsocial-dm-keys:${id}`, run);
  }
  return run();
}

/**
 * Ensure this device has unlocked messaging keys.
 * Never mints when remote wrap lookup is unavailable.
 */
export async function ensureDmKeys(
  accountId: string,
  opts?: EnsureDmKeysOptions
): Promise<EnsureDmKeysResult> {
  const id = accountId.trim().toLowerCase();
  const existing = bootstrapInflight.get(id);
  if (existing) return existing;

  const promise = withBootstrapLock(id, () =>
    ensureDmKeysUnlocked(id, opts)
  ).finally(() => {
    if (bootstrapInflight.get(id) === promise) {
      bootstrapInflight.delete(id);
    }
  });
  bootstrapInflight.set(id, promise);
  return promise;
}

async function ensureDmKeysUnlocked(
  id: string,
  opts?: EnsureDmKeysOptions
): Promise<EnsureDmKeysResult> {
  const remote = resolveRemoteOption(opts);

  if (remote?.status === 'unavailable') {
    // If we already have unlocked local keys, keep using them — but never mint.
    const existing = loadDmKeyPair(id);
    if (existing) {
      return {
        keyPair: existing,
        publicKeyEncoded: encodeDmPublicKey(existing.publicKey),
        recoveryCode: peekPendingDmRecoveryCode(id),
        created: false,
        backup: getLocalDmKeyBackup(id),
      };
    }
    throw new DmKeysUnavailableError();
  }

  const existing = loadDmKeyPair(id);
  if (existing) {
    if (remote?.status === 'found') {
      const localPk = encodeDmPublicKey(existing.publicKey);
      if (remote.value.publicKey !== localPk) {
        // Local unlocked keys disagree with profile — lock and force recovery.
        lockDmKeys(id);
        seedDmKeyBackupFromRemote(id, remote.value);
        throw new DmKeysMismatchError(
          'This device’s messaging keys do not match your profile. Enter your recovery code to restore the profile keys.'
        );
      }
    }
    return {
      keyPair: existing,
      publicKeyEncoded: encodeDmPublicKey(existing.publicKey),
      recoveryCode: peekPendingDmRecoveryCode(id),
      created: false,
      backup: getLocalDmKeyBackup(id),
    };
  }

  if (remote?.status === 'found') {
    seedDmKeyBackupFromRemote(id, remote.value);
    throw new DmKeysLockedError();
  }

  const stored = readStore(id);
  // Any existing identity material (even corrupt) must not be silently replaced.
  if (
    stored?.publicKey ||
    stored?.wrapped ||
    stored?.secretKey ||
    stored?.passkeyWrapped
  ) {
    throw new DmKeysLockedError(
      'Messaging keys on this device need recovery. Enter your recovery code to unlock.'
    );
  }

  // Verified absent (or caller omitted remote in unit tests) — mint once.
  const keyPair = generateDmKeyPair();
  const recoveryCode = generateDmRecoveryCode();
  const wrapKey = await recoveryCodeToWrapKey(recoveryCode);
  const wrapped = await wrapDmSecretKey({
    secretKey: keyPair.secretKey,
    wrapKey,
  });
  const publicKeyEncoded = encodeDmPublicKey(keyPair.publicKey);
  const secretEncoded = encodeDmSecretKey(keyPair.secretKey);
  setMemorySecret(id, secretEncoded);
  writeStore({
    accountId: id,
    publicKey: publicKeyEncoded,
    secretKey: secretEncoded,
    wrapped,
    createdAt: new Date().toISOString(),
    pendingRecoveryCode: recoveryCode,
  });
  return {
    keyPair,
    publicKeyEncoded,
    recoveryCode,
    created: true,
    backup: { publicKey: publicKeyEncoded, wrapped },
  };
}

/**
 * Restore messaging secret from recovery code.
 * Prefer `remoteBackup` when provided so a mismatched local wrap can be replaced.
 */
export async function restoreDmKeysFromRecoveryCode(opts: {
  accountId: string;
  recoveryCode: string;
  remoteBackup?: DmKeyBackup | null;
  /** Prefer remote wrap over local when both exist (mismatch recovery). */
  preferRemote?: boolean;
}): Promise<DmKeyPair> {
  const id = opts.accountId.trim().toLowerCase();
  const stored = readStore(id);
  const localBackup: DmKeyBackup | null =
    stored?.wrapped && stored.publicKey
      ? { publicKey: stored.publicKey, wrapped: stored.wrapped }
      : null;
  const backup: DmKeyBackup | null =
    opts.preferRemote || !localBackup
      ? (opts.remoteBackup ?? localBackup)
      : (localBackup ?? opts.remoteBackup ?? null);

  if (!backup?.wrapped) {
    throw new Error(
      'No messaging backup found. Open Messages on a device that already has keys, or check that your recovery wrap was published.'
    );
  }

  const wrapKey = await recoveryCodeToWrapKey(opts.recoveryCode);
  const secretKey = await unwrapDmSecretKey({
    ciphertext: backup.wrapped.ciphertext,
    nonce: backup.wrapped.nonce,
    wrapKey,
  });
  const claimedPublicKey = decodeDmPublicKey(backup.publicKey);
  assertDerivedPublicKey(claimedPublicKey, secretKey);
  const secretEncoded = encodeDmSecretKey(secretKey);
  const sameIdentity = stored?.publicKey === backup.publicKey;
  setMemorySecret(id, secretEncoded);
  writeStore({
    accountId: id,
    publicKey: encodeDmPublicKey(claimedPublicKey),
    // Keep disk secret only until passkey enroll strips it.
    secretKey:
      stored?.passkeyWrapped && sameIdentity ? undefined : secretEncoded,
    wrapped: backup.wrapped,
    passkeyWrapped: sameIdentity ? stored?.passkeyWrapped : undefined,
    createdAt: stored?.createdAt ?? new Date().toISOString(),
    recoveryCodeShownAt: sameIdentity ? stored?.recoveryCodeShownAt : undefined,
    pendingRecoveryCode: sameIdentity ? stored?.pendingRecoveryCode : undefined,
  });
  return { publicKey: claimedPublicKey, secretKey };
}

/**
 * Enroll platform passkey and wrap the messaging secret for biometric unlock.
 * Removes plaintext secret from disk; keeps it in memory for this tab.
 */
export async function enrollDmPasskeyUnlock(
  accountId: string
): Promise<
  | { ok: true }
  | { ok: false; reason: 'unsupported' | 'cancelled' | 'failed' | 'locked' }
> {
  const id = accountId.trim().toLowerCase();
  const keyPair = loadDmKeyPair(id);
  const stored = readStore(id);
  if (!keyPair || !stored?.publicKey) {
    return { ok: false, reason: 'locked' };
  }

  const enrolled = await enrollDmPasskey({ accountId: id });
  if (!enrolled.ok) {
    return { ok: false, reason: enrolled.reason };
  }

  const wrapped = await wrapDmSecretKey({
    secretKey: keyPair.secretKey,
    wrapKey: enrolled.wrapKey,
  });
  const secretEncoded = encodeDmSecretKey(keyPair.secretKey);
  setMemorySecret(id, secretEncoded);
  writeStore({
    ...stored,
    accountId: id,
    publicKey: encodeDmPublicKey(keyPair.publicKey),
    secretKey: undefined,
    passkeyWrapped: {
      ciphertext: wrapped.ciphertext,
      nonce: wrapped.nonce,
      credentialId: enrolled.credentialId,
    },
  });
  return { ok: true };
}

/** Unlock with enrolled passkey / biometric. */
export async function unlockDmKeysWithPasskey(
  accountId: string
): Promise<DmKeyPair> {
  const id = accountId.trim().toLowerCase();
  const stored = readStore(id);
  const passkey = stored?.passkeyWrapped;
  if (!passkey?.credentialId || !stored?.publicKey) {
    throw new Error('Passkey unlock is not set up on this device.');
  }

  const result = await unlockDmPasskey({
    accountId: id,
    credentialId: passkey.credentialId,
  });
  if (!result.ok) {
    if (result.reason === 'cancelled') {
      throw new Error('Passkey unlock cancelled.');
    }
    if (result.reason === 'unsupported') {
      throw new Error(
        'This device cannot unlock with a passkey. Use your recovery code.'
      );
    }
    throw new Error('Passkey unlock failed. Try your recovery code.');
  }

  const secretKey = await unwrapDmSecretKey({
    ciphertext: passkey.ciphertext,
    nonce: passkey.nonce,
    wrapKey: result.wrapKey,
  });
  const publicKey = decodeDmPublicKey(stored.publicKey);
  assertDerivedPublicKey(publicKey, secretKey);
  setMemorySecret(id, encodeDmSecretKey(secretKey));
  return { publicKey, secretKey };
}

/** Lock local secret (keep recovery + passkey wraps). */
export function lockDmKeys(accountId: string): void {
  const id = accountId.trim().toLowerCase();
  clearMemorySecret(id);
  const stored = readStore(id);
  if (!stored) return;
  writeStore({
    ...stored,
    secretKey: undefined,
  });
}
