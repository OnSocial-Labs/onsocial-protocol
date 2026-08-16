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
import type { DmKeyBackup } from '@/lib/dm/pubkey';

const STORE_PREFIX = 'onsocial.app.dm.';

export type StoredDmIdentity = {
  accountId: string;
  publicKey: string;
  /** Local unwrapped secret — only on this device after unlock. */
  secretKey?: string;
  /** Recovery-wrapped secret for restore. */
  wrapped?: { ciphertext: string; nonce: string };
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

export function getStoredDmIdentity(
  accountId: string
): StoredDmIdentity | null {
  return readStore(accountId);
}

export function hasUnlockedDmKey(accountId: string): boolean {
  const stored = readStore(accountId);
  return Boolean(stored?.secretKey && stored.publicKey);
}

export function loadDmKeyPair(accountId: string): DmKeyPair | null {
  const stored = readStore(accountId);
  if (!stored?.secretKey || !stored.publicKey) return null;
  try {
    return {
      publicKey: decodeDmPublicKey(stored.publicKey),
      secretKey: decodeDmSecretKey(stored.secretKey),
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
  writeStore({
    accountId: id,
    publicKey: remote.publicKey,
    wrapped: remote.wrapped,
    createdAt: new Date().toISOString(),
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
  if (stored?.wrapped && !stored.secretKey) {
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
  writeStore({
    accountId: id,
    publicKey: publicKeyEncoded,
    secretKey: encodeDmSecretKey(keyPair.secretKey),
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
  writeStore({
    accountId: id,
    publicKey: encodeDmPublicKey(publicKey),
    secretKey: encodeDmSecretKey(secretKey),
    wrapped: backup.wrapped,
    createdAt: stored?.createdAt ?? new Date().toISOString(),
    recoveryCodeShownAt: stored?.recoveryCodeShownAt,
  });
  return { publicKey, secretKey };
}

/** Lock local secret (keep wrapped backup). */
export function lockDmKeys(accountId: string): void {
  const stored = readStore(accountId);
  if (!stored) return;
  writeStore({
    ...stored,
    secretKey: undefined,
  });
}
