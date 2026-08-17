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
import { lookupDmKeyBackup, publishDmKeyBackup } from '@/lib/dm/pubkey';
import { recordDmKeysReset } from '@/lib/dm/thread-archive';
import type { OnSocial } from '@onsocial/sdk';

const STORE_PREFIX = 'onsocial.app.dm.';
/** Survives {@link clearDmKeysLocal} so a crash after publish can finish locally. */
const PENDING_ROTATION_PREFIX = 'onsocial.app.dm.pending-rotation.';

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
  /** When this device last completed a messaging-key reset. */
  keysResetAt?: string;
  /** Set only after the user acknowledges the recovery sheet. */
  recoveryCodeShownAt?: string;
  /**
   * Plaintext recovery code kept until acknowledgement so a failed first
   * send/publish cannot permanently lose it. Cleared by {@link acknowledgeDmRecoveryCode}.
   */
  pendingRecoveryCode?: string;
  /**
   * Conflicting remote wrap kept for recovery without destroying local material.
   * Cleared after a successful restore that adopts the remote identity.
   */
  quarantinedRemote?: DmKeyBackup;
};

type PendingDmRotation = {
  accountId: string;
  publicKey: string;
  secretKey: string;
  wrapped: { ciphertext: string; nonce: string };
  recoveryCode: string;
  createdAt: string;
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
    message = 'Messaging keys were reset elsewhere. Enter the new recovery code, or reset messaging keys again on this device.'
  ) {
    super(message);
    this.name = 'DmKeysMismatchError';
  }
}

const KEYS_RESET_ELSEWHERE_MESSAGE =
  'Messaging keys were reset elsewhere. Enter the new recovery code, or reset messaging keys again on this device.';

function storageKey(accountId: string): string {
  return `${STORE_PREFIX}${accountId.trim().toLowerCase()}`;
}

function pendingRotationKey(accountId: string): string {
  return `${PENDING_ROTATION_PREFIX}${accountId.trim().toLowerCase()}`;
}

function readPendingRotation(accountId: string): PendingDmRotation | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(pendingRotationKey(accountId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<PendingDmRotation>;
    if (
      typeof parsed.accountId !== 'string' ||
      typeof parsed.publicKey !== 'string' ||
      typeof parsed.secretKey !== 'string' ||
      typeof parsed.recoveryCode !== 'string' ||
      typeof parsed.createdAt !== 'string' ||
      !parsed.wrapped ||
      typeof parsed.wrapped.ciphertext !== 'string' ||
      typeof parsed.wrapped.nonce !== 'string'
    ) {
      return null;
    }
    return {
      accountId: parsed.accountId,
      publicKey: parsed.publicKey,
      secretKey: parsed.secretKey,
      wrapped: {
        ciphertext: parsed.wrapped.ciphertext,
        nonce: parsed.wrapped.nonce,
      },
      recoveryCode: parsed.recoveryCode,
      createdAt: parsed.createdAt,
    };
  } catch {
    return null;
  }
}

function writePendingRotation(pending: PendingDmRotation): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(
    pendingRotationKey(pending.accountId),
    JSON.stringify(pending)
  );
}

function clearPendingRotation(accountId: string): void {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(pendingRotationKey(accountId));
}

/** Test helper — inspect durable pending rotation after a simulated crash. */
export function __peekPendingDmRotationForTests(
  accountId: string
): PendingDmRotation | null {
  return readPendingRotation(accountId);
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
 * Never overwrites an existing local wrap/pubkey with a different identity
 * (mismatch must go through quarantine + recovery).
 * Clears passkey wrap when the remote identity differs and local was empty.
 */
export function seedDmKeyBackupFromRemote(
  accountId: string,
  remote: DmKeyBackup
): void {
  const id = accountId.trim().toLowerCase();
  if (loadDmKeyPair(id)) return;
  const existing = readStore(id);
  if (
    existing?.publicKey &&
    existing.publicKey !== remote.publicKey &&
    (existing.wrapped || existing.secretKey || existing.passkeyWrapped)
  ) {
    // Keep local material; stash remote for recovery UI.
    quarantineRemoteDmBackup(id, remote);
    return;
  }
  const sameIdentity = existing?.publicKey === remote.publicKey;
  writeStore({
    accountId: id,
    publicKey: remote.publicKey,
    wrapped: remote.wrapped,
    passkeyWrapped: sameIdentity ? existing?.passkeyWrapped : undefined,
    createdAt: existing?.createdAt ?? new Date().toISOString(),
    keysResetAt: sameIdentity ? existing?.keysResetAt : undefined,
    recoveryCodeShownAt: sameIdentity
      ? existing?.recoveryCodeShownAt
      : undefined,
    pendingRecoveryCode: sameIdentity
      ? existing?.pendingRecoveryCode
      : undefined,
    quarantinedRemote: undefined,
  });
}

/** Stash a conflicting remote wrap without destroying local recovery material. */
export function quarantineRemoteDmBackup(
  accountId: string,
  remote: DmKeyBackup,
  opts?: { clearPasskey?: boolean }
): void {
  const id = accountId.trim().toLowerCase();
  const existing = readStore(id);
  writeStore({
    accountId: id,
    publicKey: existing?.publicKey ?? remote.publicKey,
    secretKey: existing?.secretKey,
    wrapped: existing?.wrapped,
    passkeyWrapped: opts?.clearPasskey ? undefined : existing?.passkeyWrapped,
    createdAt: existing?.createdAt ?? new Date().toISOString(),
    keysResetAt: existing?.keysResetAt,
    recoveryCodeShownAt: existing?.recoveryCodeShownAt,
    pendingRecoveryCode: existing?.pendingRecoveryCode,
    quarantinedRemote: remote,
  });
}

export function getQuarantinedDmBackup(
  accountId: string
): DmKeyBackup | null {
  return readStore(accountId)?.quarantinedRemote ?? null;
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
  /** True when a durable pending rotation was finished after publish. */
  fromPendingRotation?: boolean;
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

/**
 * Finish a reset that published on-chain but crashed before local write.
 * Pending slot is separate from identity storage so clear+rewrite can resume.
 */
function tryCommitPendingRotation(
  id: string,
  remote: DmLookupResult<DmKeyBackup> | undefined
): EnsureDmKeysResult | null {
  const pending = readPendingRotation(id);
  if (!pending) return null;

  if (remote?.status === 'unavailable') {
    // Do not discard — retry when profile is reachable.
    return null;
  }

  if (remote?.status === 'found' && remote.value.publicKey === pending.publicKey) {
    const publicKey = decodeDmPublicKey(pending.publicKey);
    const secretKey = decodeDmSecretKey(pending.secretKey);
    assertDerivedPublicKey(publicKey, secretKey);
    const resetAt = new Date().toISOString();
    setMemorySecret(id, pending.secretKey);
    writeStore({
      accountId: id,
      publicKey: pending.publicKey,
      secretKey: pending.secretKey,
      wrapped: pending.wrapped,
      createdAt: pending.createdAt,
      keysResetAt: resetAt,
      pendingRecoveryCode: pending.recoveryCode,
    });
    clearPendingRotation(id);
    recordDmKeysReset(id, resetAt);
    return {
      keyPair: { publicKey, secretKey },
      publicKeyEncoded: pending.publicKey,
      recoveryCode: pending.recoveryCode,
      created: false,
      fromPendingRotation: true,
      backup: {
        publicKey: pending.publicKey,
        wrapped: pending.wrapped,
      },
    };
  }

  // Publish never landed, or a different identity is on profile — drop stale pending.
  clearPendingRotation(id);
  return null;
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

  const pendingCommit = tryCommitPendingRotation(id, remote);
  if (pendingCommit) return pendingCommit;

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
        // Local unlocked keys disagree with profile — lock and quarantine.
        // Passkey wraps the old secret and must not keep unlocking stale identity.
        lockDmKeys(id);
        quarantineRemoteDmBackup(id, remote.value, { clearPasskey: true });
        throw new DmKeysMismatchError(KEYS_RESET_ELSEWHERE_MESSAGE);
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
 * Prefer `remoteBackup` / quarantined remote when provided so a mismatched
 * local wrap can be replaced only after a successful unwrap.
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
  const quarantined = stored?.quarantinedRemote ?? null;
  const preferredRemote = opts.remoteBackup ?? quarantined;

  const candidates: DmKeyBackup[] = [];
  if (opts.preferRemote || !localBackup) {
    if (preferredRemote) candidates.push(preferredRemote);
    if (localBackup && localBackup.publicKey !== preferredRemote?.publicKey) {
      candidates.push(localBackup);
    }
  } else {
    if (localBackup) candidates.push(localBackup);
    if (
      preferredRemote &&
      preferredRemote.publicKey !== localBackup?.publicKey
    ) {
      candidates.push(preferredRemote);
    }
  }

  if (candidates.length === 0) {
    throw new Error(
      'No messaging backup found. Open Messages on a device that already has keys, or check that your recovery wrap was published.'
    );
  }

  const wrapKey = await recoveryCodeToWrapKey(opts.recoveryCode);
  let lastError: unknown;
  for (const backup of candidates) {
    if (!backup.wrapped) continue;
    try {
      const secretKey = await unwrapDmSecretKey({
        ciphertext: backup.wrapped.ciphertext,
        nonce: backup.wrapped.nonce,
        wrapKey,
      });
      const claimedPublicKey = decodeDmPublicKey(backup.publicKey);
      assertDerivedPublicKey(claimedPublicKey, secretKey);

      // Stale local wrap must not win over a rotated profile identity.
      if (
        preferredRemote &&
        preferredRemote.publicKey !== backup.publicKey
      ) {
        throw new DmKeysMismatchError(KEYS_RESET_ELSEWHERE_MESSAGE);
      }

      const secretEncoded = encodeDmSecretKey(secretKey);
      const sameIdentity = stored?.publicKey === backup.publicKey;
      const rotatedIdentity = Boolean(
        stored?.publicKey && stored.publicKey !== backup.publicKey
      );
      const resetAt = rotatedIdentity
        ? new Date().toISOString()
        : stored?.keysResetAt;
      setMemorySecret(id, secretEncoded);
      writeStore({
        accountId: id,
        publicKey: encodeDmPublicKey(claimedPublicKey),
        secretKey:
          stored?.passkeyWrapped && sameIdentity ? undefined : secretEncoded,
        wrapped: backup.wrapped,
        passkeyWrapped: sameIdentity ? stored?.passkeyWrapped : undefined,
        createdAt: stored?.createdAt ?? new Date().toISOString(),
        keysResetAt: resetAt,
        recoveryCodeShownAt: sameIdentity
          ? stored?.recoveryCodeShownAt
          : undefined,
        pendingRecoveryCode: sameIdentity
          ? stored?.pendingRecoveryCode
          : undefined,
        quarantinedRemote: undefined,
      });
      if (rotatedIdentity && resetAt) {
        recordDmKeysReset(id, resetAt);
      }
      return { publicKey: claimedPublicKey, secretKey };
    } catch (error) {
      lastError = error;
    }
  }

  if (lastError instanceof DmKeysMismatchError) throw lastError;
  if (lastError instanceof Error) throw lastError;
  throw new Error('Invalid recovery code');
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

/** Lock local secret (keep recovery + passkey wraps + quarantine). */
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

/** Wipe all local messaging key material for an account (memory + disk). */
export function clearDmKeysLocal(accountId: string): void {
  const id = accountId.trim().toLowerCase();
  clearMemorySecret(id);
  bootstrapInflight.delete(id);
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(storageKey(id));
}

export type ResetDmMessagingKeysResult = {
  keyPair: DmKeyPair;
  publicKeyEncoded: string;
  recoveryCode: string;
  backup: DmKeyBackup;
};

/**
 * Rotate messaging identity after total recovery loss.
 *
 * Publish-first with a durable pending-rotation slot: new material is written
 * locally before publish, confirmed on-chain, then committed as the active
 * identity. A crash after publish resumes via {@link ensureDmKeys}.
 * Ciphertext sealed to the previous pubkey stays unreadable forever.
 */
export async function resetDmMessagingKeys(opts: {
  accountId: string;
  client: OnSocial;
}): Promise<ResetDmMessagingKeysResult> {
  const id = opts.accountId.trim().toLowerCase();
  return withBootstrapLock(id, () => resetDmMessagingKeysUnlocked(opts));
}

async function resetDmMessagingKeysUnlocked(opts: {
  accountId: string;
  client: OnSocial;
}): Promise<ResetDmMessagingKeysResult> {
  const id = opts.accountId.trim().toLowerCase();

  const remote = await lookupDmKeyBackup(opts.client, id);
  if (remote.status === 'unavailable') {
    throw new DmKeysUnavailableError(
      'Could not reach your profile to reset messaging keys. Try again.'
    );
  }

  const keyPair = generateDmKeyPair();
  const recoveryCode = generateDmRecoveryCode();
  const wrapKey = await recoveryCodeToWrapKey(recoveryCode);
  const wrapped = await wrapDmSecretKey({
    secretKey: keyPair.secretKey,
    wrapKey,
  });
  const publicKeyEncoded = encodeDmPublicKey(keyPair.publicKey);
  const secretEncoded = encodeDmSecretKey(keyPair.secretKey);
  const backup: DmKeyBackup = { publicKey: publicKeyEncoded, wrapped };
  const createdAt = new Date().toISOString();

  // Durable before publish so a crash after chain confirm can finish locally.
  writePendingRotation({
    accountId: id,
    publicKey: publicKeyEncoded,
    secretKey: secretEncoded,
    wrapped,
    recoveryCode,
    createdAt,
  });

  try {
    // Intentionally overwrite profile identity (unlike reconcile, which refuses mismatch).
    await publishDmKeyBackup(opts.client, backup, id);
  } catch (error) {
    clearPendingRotation(id);
    throw error;
  }

  clearDmKeysLocal(id);
  const resetAt = new Date().toISOString();
  setMemorySecret(id, secretEncoded);
  writeStore({
    accountId: id,
    publicKey: publicKeyEncoded,
    secretKey: secretEncoded,
    wrapped,
    createdAt,
    keysResetAt: resetAt,
    pendingRecoveryCode: recoveryCode,
  });
  clearPendingRotation(id);
  recordDmKeysReset(id, resetAt);

  return {
    keyPair,
    publicKeyEncoded,
    recoveryCode,
    backup,
  };
}
