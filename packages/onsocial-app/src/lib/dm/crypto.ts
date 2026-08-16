import nacl from 'tweetnacl';
import {
  decodeBase64,
  decodeUTF8,
  encodeBase64,
  encodeUTF8,
} from 'tweetnacl-util';

export const DM_CRYPTO_VERSION = 1;
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
  senderPubkey: string;
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

export function sealDmText(opts: {
  text: string;
  recipientPublicKey: Uint8Array;
  senderKeyPair: DmKeyPair;
}): DmSealedPayload {
  const message = decodeUTF8(
    JSON.stringify({ text: opts.text } satisfies DmPlainBody)
  );
  const forRecipient = boxTo(
    message,
    opts.recipientPublicKey,
    opts.senderKeyPair.secretKey
  );
  const forSender = boxTo(
    message,
    opts.senderKeyPair.publicKey,
    opts.senderKeyPair.secretKey
  );
  return {
    v: DM_CRYPTO_VERSION,
    ciphertext: forRecipient.ciphertext,
    nonce: forRecipient.nonce,
    senderCiphertext: forSender.ciphertext,
    senderNonce: forSender.nonce,
    senderPubkey: encodeDmPublicKey(opts.senderKeyPair.publicKey),
  };
}

/**
 * Open a DM. Recipient uses the main box; sender uses the self-sealed copy.
 */
export function openDmText(opts: {
  ciphertext: string;
  nonce: string;
  senderPubkey: string;
  recipientSecretKey: Uint8Array;
  /** When reading your own sent message. */
  senderCiphertext?: string | null;
  senderNonce?: string | null;
  viewerIsSender?: boolean;
}): DmPlainBody {
  if (
    opts.viewerIsSender &&
    opts.senderCiphertext &&
    opts.senderNonce
  ) {
    const opened = nacl.box.open(
      decodeBase64(opts.senderCiphertext),
      decodeBase64(opts.senderNonce),
      decodeDmPublicKey(opts.senderPubkey),
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
    decodeDmPublicKey(opts.senderPubkey),
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

/** Seal arbitrary bytes (e.g. media) with the same box keys. */
export function sealDmBytes(opts: {
  bytes: Uint8Array;
  recipientPublicKey: Uint8Array;
  senderKeyPair: DmKeyPair;
}): { ciphertext: Uint8Array; nonce: Uint8Array } {
  const nonce = nacl.randomBytes(nacl.box.nonceLength);
  const boxed = nacl.box(
    opts.bytes,
    nonce,
    opts.recipientPublicKey,
    opts.senderKeyPair.secretKey
  );
  if (!boxed) throw new Error('Failed to seal bytes');
  return { ciphertext: boxed, nonce };
}

export function openDmBytes(opts: {
  ciphertext: Uint8Array;
  nonce: Uint8Array;
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
