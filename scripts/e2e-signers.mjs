/**
 * General-purpose test signers.
 *
 * Cloud secrets are named TICKET_E2E_* (organizer + buyer), but any test that
 * needs a real NEAR key can use them. Generic aliases win when set:
 *
 *   E2E_SIGNER_ACCOUNT / E2E_SIGNER_PRIVATE_KEY
 *   E2E_COUNTERPARTY_ACCOUNT / E2E_COUNTERPARTY_PRIVATE_KEY
 *
 * Fallbacks: TICKET_E2E_ORGANIZER_* (primary) and TICKET_E2E_BUYER_*
 * (counterparty). ACCOUNT_ID / TEST_ACCOUNT_ID / TEST_PRIVATE_KEY still win
 * when the caller already set them.
 */

import { createPrivateKey, createPublicKey } from 'node:crypto';

const B58_ALPHABET =
  '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

/** @typedef {'primary' | 'counterparty'} E2eSignerRole */

/**
 * @param {string} name
 * @returns {string | undefined}
 */
function envTrim(name) {
  const value = process.env[name];
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

/**
 * @param {E2eSignerRole} [role]
 * @returns {string | null}
 */
export function resolveE2eSignerAccount(role = 'primary') {
  if (role === 'counterparty') {
    return (
      envTrim('E2E_COUNTERPARTY_ACCOUNT') ||
      envTrim('TICKET_E2E_BUYER_ACCOUNT') ||
      envTrim('SECONDARY_ACCOUNT_ID') ||
      null
    );
  }
  return (
    envTrim('E2E_SIGNER_ACCOUNT') ||
    envTrim('TICKET_E2E_ORGANIZER_ACCOUNT') ||
    envTrim('ACCOUNT_ID') ||
    envTrim('TEST_ACCOUNT_ID') ||
    null
  );
}

/**
 * @param {E2eSignerRole} [role]
 * @returns {string | null}
 */
export function resolveE2eSignerPrivateKey(role = 'primary') {
  if (role === 'counterparty') {
    return (
      envTrim('E2E_COUNTERPARTY_PRIVATE_KEY') ||
      envTrim('TICKET_E2E_BUYER_PRIVATE_KEY') ||
      envTrim('TEST_PRIVATE_KEY') ||
      null
    );
  }
  return (
    envTrim('E2E_SIGNER_PRIVATE_KEY') ||
    envTrim('TICKET_E2E_ORGANIZER_PRIVATE_KEY') ||
    envTrim('TEST_PRIVATE_KEY') ||
    null
  );
}

/**
 * @param {Buffer} bytes
 * @returns {string}
 */
export function base58Encode(bytes) {
  let num = 0n;
  for (const byte of bytes) {
    num = (num << 8n) + BigInt(byte);
  }
  let out = '';
  while (num > 0n) {
    const rem = Number(num % 58n);
    num /= 58n;
    out = B58_ALPHABET[rem] + out;
  }
  for (const byte of bytes) {
    if (byte === 0) out = `1${out}`;
    else break;
  }
  return out || '1';
}

/**
 * @param {string} encoded
 * @returns {Buffer}
 */
export function base58Decode(encoded) {
  let num = 0n;
  for (const char of encoded) {
    const index = B58_ALPHABET.indexOf(char);
    if (index < 0) {
      throw new Error('Invalid base58 character in NEAR key');
    }
    num = num * 58n + BigInt(index);
  }
  let hex = num.toString(16);
  if (hex.length % 2) hex = `0${hex}`;
  const body = Buffer.from(hex, 'hex');
  let leading = 0;
  for (const char of encoded) {
    if (char === '1') leading += 1;
    else break;
  }
  return Buffer.concat([Buffer.alloc(leading), body]);
}

/**
 * @param {Buffer} seed32
 * @returns {Buffer}
 */
export function ed25519PublicFromSeed(seed32) {
  if (seed32.length !== 32) {
    throw new Error(`ed25519 seed must be 32 bytes, got ${seed32.length}`);
  }
  const pkcs8 = Buffer.concat([
    Buffer.from('302e020100300506032b657004220420', 'hex'),
    seed32,
  ]);
  const key = createPrivateKey({ key: pkcs8, format: 'der', type: 'pkcs8' });
  const spki = createPublicKey(key).export({ type: 'spki', format: 'der' });
  return Buffer.from(spki.subarray(-32));
}

/**
 * @param {Buffer} decoded
 * @returns {Buffer}
 */
function normalizeNearSecret(decoded) {
  // Same rule as @near-js/crypto KeyPairEd25519: first 32 bytes are the seed.
  // Short env keys may decode to 33 bytes; full NEAR secrets are 64 (seed+pub).
  if (decoded.length >= 32) return decoded.subarray(0, 32);
  throw new Error(`Unexpected NEAR secret key length: ${decoded.length}`);
}

/**
 * @param {string} accountId
 * @param {string} privateKey
 * @returns {{
 *   accountId: string,
 *   secretKey: Buffer,
 *   publicKey: string,
 *   privateKey: string,
 * }}
 */
export function decodeNearKeypair(accountId, privateKey) {
  const raw = privateKey.replace(/^ed25519:/, '').trim();
  const secret = normalizeNearSecret(base58Decode(raw));
  const seed = secret.subarray(0, 32);
  const publicBytes =
    secret.length === 64 ? secret.subarray(32, 64) : ed25519PublicFromSeed(seed);
  return {
    accountId,
    secretKey: seed,
    publicKey: `ed25519:${base58Encode(publicBytes)}`,
    privateKey: privateKey.startsWith('ed25519:')
      ? privateKey
      : `ed25519:${raw}`,
  };
}

/**
 * @param {E2eSignerRole} [role]
 * @returns {{
 *   accountId: string,
 *   secretKey: Buffer,
 *   publicKey: string,
 *   privateKey: string,
 * } | null}
 */
export function loadE2eKeypair(role = 'primary') {
  const accountId = resolveE2eSignerAccount(role);
  const privateKey = resolveE2eSignerPrivateKey(role);
  if (!accountId || !privateKey) return null;
  return decodeNearKeypair(accountId, privateKey);
}

/**
 * @param {string} accountId
 * @returns {{
 *   accountId: string,
 *   secretKey: Buffer,
 *   publicKey: string,
 *   privateKey: string,
 * } | null}
 */
export function e2eKeypairForAccount(accountId) {
  const wanted = accountId.trim();
  if (!wanted) return null;
  for (const role of /** @type {const} */ (['primary', 'counterparty'])) {
    const keypair = loadE2eKeypair(role);
    if (keypair?.accountId === wanted) return keypair;
  }
  return null;
}

/**
 * @returns {{
 *   primary: ReturnType<typeof loadE2eKeypair>,
 *   counterparty: ReturnType<typeof loadE2eKeypair>,
 * }}
 */
export function loadE2eSigners() {
  return {
    primary: loadE2eKeypair('primary'),
    counterparty: loadE2eKeypair('counterparty'),
  };
}

/** @param {E2eSignerRole} [role] */
export function hasE2eSigner(role = 'primary') {
  return loadE2eKeypair(role) != null;
}
