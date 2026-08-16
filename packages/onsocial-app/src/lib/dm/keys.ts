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

export type EnsureDmKeysResult = {
  keyPair: DmKeyPair;
  publicKeyEncoded: string;
  /** Present only when keys were just created. */
  recoveryCode: string | null;
  created: boolean;
};

/**
 * Ensure this device has messaging keys.
 * New keys return a one-time recovery code the UI must show.
 */
export async function ensureDmKeys(
  accountId: string
): Promise<EnsureDmKeysResult> {
  const id = accountId.trim().toLowerCase();
  const existing = loadDmKeyPair(id);
  if (existing) {
    return {
      keyPair: existing,
      publicKeyEncoded: encodeDmPublicKey(existing.publicKey),
      recoveryCode: null,
      created: false,
    };
  }

  const stored = readStore(id);
  if (stored?.wrapped && !stored.secretKey) {
    throw new Error(
      'Messages are locked on this device. Enter your recovery code to unlock.'
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
  };
}

/** Restore messaging secret from recovery code (new device). */
export async function restoreDmKeysFromRecoveryCode(opts: {
  accountId: string;
  recoveryCode: string;
  publicKeyEncoded?: string;
}): Promise<DmKeyPair> {
  const id = opts.accountId.trim().toLowerCase();
  const stored = readStore(id);
  if (!stored?.wrapped) {
    throw new Error('No backup found on this device for that account.');
  }
  const wrapKey = await recoveryCodeToWrapKey(opts.recoveryCode);
  const secretKey = await unwrapDmSecretKey({
    ciphertext: stored.wrapped.ciphertext,
    nonce: stored.wrapped.nonce,
    wrapKey,
  });
  const publicKey = opts.publicKeyEncoded
    ? decodeDmPublicKey(opts.publicKeyEncoded)
    : decodeDmPublicKey(stored.publicKey);
  writeStore({
    ...stored,
    accountId: id,
    publicKey: encodeDmPublicKey(publicKey),
    secretKey: encodeDmSecretKey(secretKey),
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
