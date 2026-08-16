import nacl from 'tweetnacl';
import {
  decodeBase64,
  decodeUTF8,
  encodeBase64,
  encodeUTF8,
} from 'tweetnacl-util';

/**
 * v1 = identity-key box;
 * v2 = per-message ephemeral box (forward secrecy for ciphertext only —
 * not Signal-style PFS / ratchet; identity still binds attribution via authTag).
 */
export const DM_CRYPTO_VERSION = 2;
export const DM_PUBKEY_PROFILE_KEY = 'messaging_pubkey';
/** Recovery-wrapped secret (ciphertext only) — safe to publish; needs recovery code to open. */
export const DM_WRAP_PROFILE_KEY = 'messaging_wrap';

export type DmKeyPair = {
  publicKey: Uint8Array;
  secretKey: Uint8Array;
};

export type DmSealedPayload = {
  v: number;
  /** Sealed to recipient. */
  ciphertext: string;
  nonce: string;
  /** Sealed to sender so Sent/thread UI can decrypt locally. */
  senderCiphertext: string;
  senderNonce: string;
  /** Long-term identity pubkey (attribution). */
  senderPubkey: string;
  /** Ephemeral pubkey used for this seal (forward secrecy). */
  ephemeralPubkey: string;
  /**
   * Sender-authenticated MAC binding identity key to the envelope.
   * Prevents a malicious mailbox from forging attribution.
   */
  authTag: string;
};

export type DmPlainBody = {
  text: string;
};

function assertKeyLength(key: Uint8Array, expected: number, label: string) {
  if (key.length !== expected) {
    throw new Error(`${label} must be ${expected} bytes`);
  }
}

export function generateDmKeyPair(): DmKeyPair {
  return nacl.box.keyPair();
}

export function encodeDmPublicKey(publicKey: Uint8Array): string {
  assertKeyLength(publicKey, nacl.box.publicKeyLength, 'publicKey');
  return encodeBase64(publicKey);
}

export function decodeDmPublicKey(encoded: string): Uint8Array {
  const bytes = decodeBase64(encoded.trim());
  assertKeyLength(bytes, nacl.box.publicKeyLength, 'publicKey');
  return bytes;
}

export function encodeDmSecretKey(secretKey: Uint8Array): string {
  assertKeyLength(secretKey, nacl.box.secretKeyLength, 'secretKey');
  return encodeBase64(secretKey);
}

export function decodeDmSecretKey(encoded: string): Uint8Array {
  const bytes = decodeBase64(encoded.trim());
  assertKeyLength(bytes, nacl.box.secretKeyLength, 'secretKey');
  return bytes;
}

/** Derive the box public key that belongs to a secret key. */
export function publicKeyFromSecretKey(secretKey: Uint8Array): Uint8Array {
  assertKeyLength(secretKey, nacl.box.secretKeyLength, 'secretKey');
  return nacl.box.keyPair.fromSecretKey(secretKey).publicKey;
}

/** Constant-time-ish equality for key material. */
export function dmKeysEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) {
    diff |= a[i]! ^ b[i]!;
  }
  return diff === 0;
}

function boxTo(
  message: Uint8Array,
  recipientPublicKey: Uint8Array,
  senderSecretKey: Uint8Array
): { ciphertext: string; nonce: string } {
  const nonce = nacl.randomBytes(nacl.box.nonceLength);
  const boxed = nacl.box(message, nonce, recipientPublicKey, senderSecretKey);
  if (!boxed) throw new Error('Failed to seal message');
  return {
    ciphertext: encodeBase64(boxed),
    nonce: encodeBase64(nonce),
  };
}

function concatBytes(...parts: Uint8Array[]): Uint8Array {
  let total = 0;
  for (const part of parts) total += part.length;
  const out = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

/**
 * Bind long-term sender identity to the sealed envelope so a malicious
 * mailbox cannot re-attribute ciphertext to another account.
 * Shared secret = ECDH(peerPublic, localSecret); tag = SHA-512 truncated.
 */
export function computeDmAuthTag(opts: {
  ciphertext: string;
  nonce: string;
  senderPubkey: string;
  ephemeralPubkey: string;
  /** Peer identity pubkey (recipient when sealing; claimed sender when verifying). */
  peerPublicKey: Uint8Array;
  localSecretKey: Uint8Array;
}): string {
  const shared = nacl.box.before(opts.peerPublicKey, opts.localSecretKey);
  const material = concatBytes(
    decodeUTF8('onsocial-dm-auth-v1'),
    shared,
    decodeUTF8(opts.ciphertext.trim()),
    decodeUTF8(opts.nonce.trim()),
    decodeUTF8(opts.senderPubkey.trim()),
    decodeUTF8(opts.ephemeralPubkey.trim())
  );
  return encodeBase64(nacl.hash(material).slice(0, 32));
}

export function verifyDmAuthTag(opts: {
  ciphertext: string;
  nonce: string;
  senderPubkey: string;
  ephemeralPubkey: string;
  authTag: string;
  peerPublicKey: Uint8Array;
  localSecretKey: Uint8Array;
}): boolean {
  const expected = computeDmAuthTag({
    ciphertext: opts.ciphertext,
    nonce: opts.nonce,
    senderPubkey: opts.senderPubkey,
    ephemeralPubkey: opts.ephemeralPubkey,
    peerPublicKey: opts.peerPublicKey,
    localSecretKey: opts.localSecretKey,
  });
  const a = decodeBase64(expected);
  const b = decodeBase64(opts.authTag.trim());
  return dmKeysEqual(a, b);
}

/**
 * Seal text with a fresh ephemeral keypair (forward secrecy for ciphertext).
 * Recipient opens with ephemeralPubkey + their secret.
 * Sender opens self-copy with ephemeralPubkey + their secret.
 * authTag binds the long-term sender identity to the envelope.
 */
export function sealDmText(opts: {
  text: string;
  recipientPublicKey: Uint8Array;
  senderKeyPair: DmKeyPair;
}): DmSealedPayload {
  const message = decodeUTF8(
    JSON.stringify({ text: opts.text } satisfies DmPlainBody)
  );
  const ephemeral = generateDmKeyPair();
  const forRecipient = boxTo(
    message,
    opts.recipientPublicKey,
    ephemeral.secretKey
  );
  const forSender = boxTo(
    message,
    opts.senderKeyPair.publicKey,
    ephemeral.secretKey
  );
  const senderPubkey = encodeDmPublicKey(opts.senderKeyPair.publicKey);
  const ephemeralPubkey = encodeDmPublicKey(ephemeral.publicKey);
  const authTag = computeDmAuthTag({
    ciphertext: forRecipient.ciphertext,
    nonce: forRecipient.nonce,
    senderPubkey,
    ephemeralPubkey,
    peerPublicKey: opts.recipientPublicKey,
    localSecretKey: opts.senderKeyPair.secretKey,
  });
  return {
    v: DM_CRYPTO_VERSION,
    ciphertext: forRecipient.ciphertext,
    nonce: forRecipient.nonce,
    senderCiphertext: forSender.ciphertext,
    senderNonce: forSender.nonce,
    senderPubkey,
    ephemeralPubkey,
    authTag,
  };
}

/**
 * Open a DM. Prefer ephemeral pubkey when present (v2);
 * fall back to identity senderPubkey for legacy v1 rows.
 * When authTag is present, verify sender attribution before decrypt.
 */
export function openDmText(opts: {
  ciphertext: string;
  nonce: string;
  senderPubkey: string;
  recipientSecretKey: Uint8Array;
  ephemeralPubkey?: string | null;
  senderCiphertext?: string | null;
  senderNonce?: string | null;
  authTag?: string | null;
  viewerIsSender?: boolean;
}): DmPlainBody {
  const ephemeral = opts.ephemeralPubkey?.trim() || '';
  // Auth binds sender identity ↔ recipient secret. Skip for the sender's
  // self-copy (ECDH peer would be self, not the recipient).
  if (opts.authTag?.trim() && !opts.viewerIsSender) {
    if (!ephemeral) {
      throw new Error('Authenticated envelope requires ephemeral pubkey');
    }
    const claimedSender = decodeDmPublicKey(opts.senderPubkey);
    const ok = verifyDmAuthTag({
      ciphertext: opts.ciphertext,
      nonce: opts.nonce,
      senderPubkey: opts.senderPubkey,
      ephemeralPubkey: ephemeral,
      authTag: opts.authTag,
      peerPublicKey: claimedSender,
      localSecretKey: opts.recipientSecretKey,
    });
    if (!ok) {
      throw new Error('Message authentication failed');
    }
  }

  const peerPubkey = ephemeral
    ? decodeDmPublicKey(ephemeral)
    : decodeDmPublicKey(opts.senderPubkey);

  if (opts.viewerIsSender && opts.senderCiphertext && opts.senderNonce) {
    const opened = nacl.box.open(
      decodeBase64(opts.senderCiphertext),
      decodeBase64(opts.senderNonce),
      peerPubkey,
      opts.recipientSecretKey
    );
    if (!opened) throw new Error('Failed to open sent message');
    const parsed = JSON.parse(encodeUTF8(opened)) as DmPlainBody;
    if (typeof parsed?.text !== 'string') {
      throw new Error('Invalid message payload');
    }
    return { text: parsed.text };
  }

  const opened = nacl.box.open(
    decodeBase64(opts.ciphertext),
    decodeBase64(opts.nonce),
    peerPubkey,
    opts.recipientSecretKey
  );
  if (!opened) {
    throw new Error('Failed to open message');
  }
  const parsed = JSON.parse(encodeUTF8(opened)) as DmPlainBody;
  if (typeof parsed?.text !== 'string') {
    throw new Error('Invalid message payload');
  }
  return { text: parsed.text };
}

/** Seal arbitrary bytes with a fresh ephemeral key (same as text forward secrecy). */
export function sealDmBytes(opts: {
  bytes: Uint8Array;
  recipientPublicKey: Uint8Array;
  senderKeyPair: DmKeyPair;
  /** Reuse an ephemeral from the accompanying text seal when dual-sealing media. */
  ephemeral?: DmKeyPair;
}): {
  ciphertext: Uint8Array;
  nonce: Uint8Array;
  ephemeralPubkey: string;
  ephemeral: DmKeyPair;
} {
  const ephemeral = opts.ephemeral ?? generateDmKeyPair();
  const nonce = nacl.randomBytes(nacl.box.nonceLength);
  const boxed = nacl.box(
    opts.bytes,
    nonce,
    opts.recipientPublicKey,
    ephemeral.secretKey
  );
  if (!boxed) throw new Error('Failed to seal bytes');
  return {
    ciphertext: boxed,
    nonce,
    ephemeralPubkey: encodeDmPublicKey(ephemeral.publicKey),
    ephemeral,
  };
}

export function openDmBytes(opts: {
  ciphertext: Uint8Array;
  nonce: Uint8Array;
  /** Ephemeral or legacy identity pubkey of the sealer. */
  senderPubkey: Uint8Array;
  recipientSecretKey: Uint8Array;
}): Uint8Array {
  const opened = nacl.box.open(
    opts.ciphertext,
    opts.nonce,
    opts.senderPubkey,
    opts.recipientSecretKey
  );
  if (!opened) throw new Error('Failed to open bytes');
  return opened;
}

async function sha512(bytes: Uint8Array): Promise<Uint8Array> {
  const digest = await crypto.subtle.digest('SHA-512', bytes.slice());
  return new Uint8Array(digest);
}

/** Derive a secretbox key from a recovery code. */
export async function recoveryCodeToWrapKey(
  recoveryCode: string
): Promise<Uint8Array> {
  const material = decodeUTF8(`onsocial-dm-wrap-v1:${recoveryCode.trim()}`);
  const digest = await sha512(material);
  return digest.slice(0, nacl.secretbox.keyLength);
}

export async function wrapDmSecretKey(opts: {
  secretKey: Uint8Array;
  wrapKey: Uint8Array;
}): Promise<{ ciphertext: string; nonce: string }> {
  assertKeyLength(opts.wrapKey, nacl.secretbox.keyLength, 'wrapKey');
  const nonce = nacl.randomBytes(nacl.secretbox.nonceLength);
  const boxed = nacl.secretbox(opts.secretKey, nonce, opts.wrapKey);
  return {
    ciphertext: encodeBase64(boxed),
    nonce: encodeBase64(nonce),
  };
}

export async function unwrapDmSecretKey(opts: {
  ciphertext: string;
  nonce: string;
  wrapKey: Uint8Array;
}): Promise<Uint8Array> {
  const opened = nacl.secretbox.open(
    decodeBase64(opts.ciphertext),
    decodeBase64(opts.nonce),
    opts.wrapKey
  );
  if (!opened) throw new Error('Invalid recovery code');
  assertKeyLength(opened, nacl.box.secretKeyLength, 'secretKey');
  return opened;
}

/** Generate a human recovery code (groups of 4). */
export function generateDmRecoveryCode(): string {
  const bytes = nacl.randomBytes(16);
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let raw = '';
  for (const b of bytes) {
    raw += alphabet[b % alphabet.length];
  }
  return raw.match(/.{1,4}/g)?.join('-') ?? raw;
}
