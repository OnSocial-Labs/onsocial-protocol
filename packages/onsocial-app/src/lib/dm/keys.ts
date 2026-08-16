import {
  decodeDmPublicKey,
  decodeDmSecretKey,
  encodeDmPublicKey,
  encodeDmSecretKey,
  generateDmKeyPair,
  generateDmRecoveryCode,
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
import type { DmKeyBackup } from '@/lib/dm/pubkey';

const STORE_PREFIX = 'onsocial.app.dm.';

/** In-tab unlocked secrets — preferred when passkey enroll clears disk secret. */
const memorySecrets = new Map<string, string>();

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
  recoveryCodeShownAt?: string;
};

export class DmKeysLockedError extends Error {
  constructor(
    message = 'Messages are locked on this device. Enter your recovery code to unlock.'
  ) {
    super(message);
    this.name = 'DmKeysLockedError';
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

/** Test helper — clear in-tab secrets between unit tests. */
export function __resetDmKeyMemoryForTests(): void {
  memorySecrets.clear();
}

export function getStoredDmIdentity(
  accountId: string
): StoredDmIdentity | null {
  return readStore(accountId);
}

export function hasUnlockedDmKey(accountId: string): boolean {
  const id = accountId.trim().toLowerCase();
  if (memorySecrets.has(id)) return true;
  const stored = readStore(id);
  return Boolean(stored?.secretKey && stored.publicKey);
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
    return {
      publicKey: decodeDmPublicKey(stored.publicKey),
      secretKey: decodeDmSecretKey(secretEncoded),
    };
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
 */
export function seedDmKeyBackupFromRemote(
  accountId: string,
  remote: DmKeyBackup
): void {
  const id = accountId.trim().toLowerCase();
  if (loadDmKeyPair(id)) return;
  const existing = readStore(id);
  writeStore({
    accountId: id,
    publicKey: remote.publicKey,
    wrapped: remote.wrapped,
    passkeyWrapped: existing?.passkeyWrapped,
    createdAt: existing?.createdAt ?? new Date().toISOString(),
    recoveryCodeShownAt: existing?.recoveryCodeShownAt,
  });
}

export type EnsureDmKeysResult = {
  keyPair: DmKeyPair;
  publicKeyEncoded: string;
  /** Present only when keys were just created. */
  recoveryCode: string | null;
  created: boolean;
  backup: DmKeyBackup | null;
};

/**
 * Ensure this device has unlocked messaging keys.
 * Pass `remoteBackup` from social so we never mint a new identity over an
 * existing published wrap (silent key rotation).
 */
export async function ensureDmKeys(
  accountId: string,
  opts?: { remoteBackup?: DmKeyBackup | null }
): Promise<EnsureDmKeysResult> {
  const id = accountId.trim().toLowerCase();
  const existing = loadDmKeyPair(id);
  if (existing) {
    const backup = getLocalDmKeyBackup(id);
    return {
      keyPair: existing,
      publicKeyEncoded: encodeDmPublicKey(existing.publicKey),
      recoveryCode: null,
      created: false,
      backup,
    };
  }

  const remote = opts?.remoteBackup ?? null;
  if (remote?.wrapped) {
    seedDmKeyBackupFromRemote(id, remote);
  }

  const stored = readStore(id);
  if (stored?.wrapped && !stored.secretKey && !memorySecrets.has(id)) {
    throw new DmKeysLockedError();
  }
  if (remote?.wrapped) {
    throw new DmKeysLockedError();
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
  setMemorySecret(id, secretEncoded);
  writeStore({
    accountId: id,
    publicKey: publicKeyEncoded,
    secretKey: secretEncoded,
    wrapped,
    createdAt: new Date().toISOString(),
    recoveryCodeShownAt: new Date().toISOString(),
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
 * Uses local wrap first; otherwise `remoteBackup` from social (new device).
 */
export async function restoreDmKeysFromRecoveryCode(opts: {
  accountId: string;
  recoveryCode: string;
  remoteBackup?: DmKeyBackup | null;
}): Promise<DmKeyPair> {
  const id = opts.accountId.trim().toLowerCase();
  const stored = readStore(id);
  const backup: DmKeyBackup | null =
    stored?.wrapped && stored.publicKey
      ? { publicKey: stored.publicKey, wrapped: stored.wrapped }
      : (opts.remoteBackup ?? null);

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
  const publicKey = decodeDmPublicKey(backup.publicKey);
  const secretEncoded = encodeDmSecretKey(secretKey);
  setMemorySecret(id, secretEncoded);
  writeStore({
    accountId: id,
    publicKey: encodeDmPublicKey(publicKey),
    // Keep disk secret only until passkey enroll strips it.
    secretKey: stored?.passkeyWrapped ? undefined : secretEncoded,
    wrapped: backup.wrapped,
    passkeyWrapped: stored?.passkeyWrapped,
    createdAt: stored?.createdAt ?? new Date().toISOString(),
    recoveryCodeShownAt: stored?.recoveryCodeShownAt,
  });
  return { publicKey, secretKey };
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
