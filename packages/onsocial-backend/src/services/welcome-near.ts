import { createHash, randomBytes } from 'crypto';
import nacl from 'tweetnacl';
import { config } from '../config/index.js';
import { logger } from '../logger.js';
import { viewAccountBalance } from './near.js';

const WELCOME_PREFIX = 'OnSocial Portal Welcome NEAR';
const WELCOME_RECIPIENT = 'OnSocial Portal';
const CHALLENGE_TTL_MS = 5 * 60 * 1000;

export interface WelcomeNearChallenge {
  account_id: string;
  recipient: string;
  nonce: string;
  message: string;
  issued_at: string;
  expires_at: string;
}

interface ParsedWelcomeMessage {
  accountId: string;
  nonce: string;
  issuedAt: string;
  expiresAt: string;
  network: string;
}

function base58Decode(value: string): Uint8Array {
  const alphabet = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
  const bytes: number[] = [];

  for (const char of value) {
    let carry = alphabet.indexOf(char);
    if (carry < 0) {
      throw new Error('Invalid base58 character');
    }

    for (let index = 0; index < bytes.length; index += 1) {
      carry += bytes[index] * 58;
      bytes[index] = carry & 0xff;
      carry >>= 8;
    }

    while (carry > 0) {
      bytes.push(carry & 0xff);
      carry >>= 8;
    }
  }

  for (const char of value) {
    if (char !== '1') {
      break;
    }
    bytes.push(0);
  }

  return new Uint8Array(bytes.reverse());
}

function decodeBase64(value: string): Uint8Array {
  return new Uint8Array(Buffer.from(value, 'base64'));
}

function encodeU32(value: number): Uint8Array {
  const buffer = new ArrayBuffer(4);
  new DataView(buffer).setUint32(0, value, true);
  return new Uint8Array(buffer);
}

function encodeString(value: string): Uint8Array {
  const bytes = new TextEncoder().encode(value);
  const encodedLength = encodeU32(bytes.length);
  const output = new Uint8Array(encodedLength.length + bytes.length);
  output.set(encodedLength);
  output.set(bytes, encodedLength.length);
  return output;
}

function encodeOptionalString(value: string | null): Uint8Array {
  if (value == null) {
    return new Uint8Array([0]);
  }

  const encodedValue = encodeString(value);
  const output = new Uint8Array(1 + encodedValue.length);
  output[0] = 1;
  output.set(encodedValue, 1);
  return output;
}

function concatBytes(parts: Uint8Array[]): Uint8Array {
  const totalLength = parts.reduce((sum, part) => sum + part.length, 0);
  const output = new Uint8Array(totalLength);
  let offset = 0;

  for (const part of parts) {
    output.set(part, offset);
    offset += part.length;
  }

  return output;
}

function serializeNep413Payload(input: {
  message: string;
  nonce: Uint8Array;
  recipient: string;
  callbackUrl: string | null;
}): Uint8Array {
  const prefix = encodeU32(2 ** 31 + 413);
  const payload = concatBytes([
    encodeString(input.message),
    input.nonce,
    encodeString(input.recipient),
    encodeOptionalString(input.callbackUrl),
  ]);

  return createHash('sha256')
    .update(Buffer.from(concatBytes([prefix, payload])))
    .digest();
}

function parsePublicKey(publicKey: string): Uint8Array | null {
  const [curve, keyData] = publicKey.split(':');
  if (curve !== 'ed25519' || !keyData) {
    return null;
  }

  try {
    const decoded = decodeBase64(keyData);
    if (decoded.length === 32) {
      return decoded;
    }
  } catch {
    // Fall through to base58.
  }

  try {
    const decoded = base58Decode(keyData);
    if (decoded.length === 32) {
      return decoded;
    }
  } catch {
    // Ignore invalid base58 and return null below.
  }

  return null;
}

function createWelcomeMessage(input: {
  accountId: string;
  nonce: string;
  issuedAt: string;
  expiresAt: string;
}): string {
  return [
    WELCOME_PREFIX,
    `Account: ${input.accountId}`,
    `Nonce: ${input.nonce}`,
    `Issued At: ${input.issuedAt}`,
    `Expires At: ${input.expiresAt}`,
    `Network: ${config.nearNetwork}`,
  ].join('\n');
}

function parseWelcomeMessage(message: string): ParsedWelcomeMessage | null {
  const lines = message.split('\n');
  if (lines.length !== 6 || lines[0] !== WELCOME_PREFIX) {
    return null;
  }

  const accountId = lines[1]?.replace(/^Account: /, '');
  const nonce = lines[2]?.replace(/^Nonce: /, '');
  const issuedAt = lines[3]?.replace(/^Issued At: /, '');
  const expiresAt = lines[4]?.replace(/^Expires At: /, '');
  const network = lines[5]?.replace(/^Network: /, '');

  if (!accountId || !nonce || !issuedAt || !expiresAt || !network) {
    return null;
  }

  return { accountId, nonce, issuedAt, expiresAt, network };
}

async function verifyKeyBelongsToAccount(
  accountId: string,
  publicKey: string
): Promise<boolean> {
  try {
    const response = await fetch(config.nearRpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 'onsocial-welcome-near',
        method: 'query',
        params: {
          request_type: 'view_access_key_list',
          account_id: accountId,
          finality: 'final',
        },
      }),
    });

    if (!response.ok) {
      return false;
    }

    const body = (await response.json()) as {
      result?: { keys?: Array<{ public_key: string }> };
    };

    return Boolean(
      body.result?.keys?.some((key) => key.public_key === publicKey)
    );
  } catch (error) {
    logger.error({ accountId, error }, 'Failed to verify welcome NEAR key');
    return false;
  }
}

export function buildWelcomeNearChallenge(
  accountId: string,
  now = Date.now()
): WelcomeNearChallenge {
  const issuedAt = new Date(now).toISOString();
  const expiresAt = new Date(now + CHALLENGE_TTL_MS).toISOString();
  const nonce = randomBytes(32).toString('base64');

  return {
    account_id: accountId,
    recipient: WELCOME_RECIPIENT,
    nonce,
    message: createWelcomeMessage({
      accountId,
      nonce,
      issuedAt,
      expiresAt,
    }),
    issued_at: issuedAt,
    expires_at: expiresAt,
  };
}

export async function verifyWelcomeNearAuth(input: {
  accountId: string;
  publicKey: string;
  signature: string;
  message: string;
}): Promise<{ valid: boolean; error?: string }> {
  const parsed = parseWelcomeMessage(input.message);
  if (!parsed) {
    return { valid: false, error: 'Invalid welcome message' };
  }

  if (parsed.accountId !== input.accountId) {
    return { valid: false, error: 'Welcome message account mismatch' };
  }

  if (parsed.network !== config.nearNetwork) {
    return { valid: false, error: 'Welcome message network mismatch' };
  }

  let nonceBytes: Uint8Array;
  try {
    nonceBytes = decodeBase64(parsed.nonce);
  } catch {
    return { valid: false, error: 'Invalid welcome nonce' };
  }

  if (nonceBytes.length !== 32) {
    return { valid: false, error: 'Invalid welcome nonce length' };
  }

  const issuedAtMs = Date.parse(parsed.issuedAt);
  const expiresAtMs = Date.parse(parsed.expiresAt);
  if (!Number.isFinite(issuedAtMs) || !Number.isFinite(expiresAtMs)) {
    return { valid: false, error: 'Invalid welcome timestamps' };
  }

  const now = Date.now();
  if (issuedAtMs > now + 60_000) {
    return { valid: false, error: 'Welcome timestamp is in the future' };
  }

  if (expiresAtMs < now) {
    return { valid: false, error: 'Welcome challenge has expired' };
  }

  if (expiresAtMs - issuedAtMs > CHALLENGE_TTL_MS + 1_000) {
    return { valid: false, error: 'Welcome validity window is invalid' };
  }

  const publicKeyBytes = parsePublicKey(input.publicKey);
  if (!publicKeyBytes || publicKeyBytes.length !== 32) {
    return { valid: false, error: 'Invalid public key format' };
  }

  let signatureBytes: Uint8Array;
  try {
    signatureBytes = decodeBase64(input.signature);
  } catch {
    return { valid: false, error: 'Invalid signature encoding' };
  }

  if (signatureBytes.length !== 64) {
    return { valid: false, error: 'Invalid signature length' };
  }

  const messageBytes = serializeNep413Payload({
    message: input.message,
    nonce: nonceBytes,
    recipient: WELCOME_RECIPIENT,
    callbackUrl: null,
  });
  const isValidSignature = nacl.sign.detached.verify(
    messageBytes,
    signatureBytes,
    publicKeyBytes
  );

  if (!isValidSignature) {
    return { valid: false, error: 'Invalid signature' };
  }

  const keyBelongsToAccount = await verifyKeyBelongsToAccount(
    input.accountId,
    input.publicKey
  );
  if (!keyBelongsToAccount) {
    return { valid: false, error: 'Public key does not belong to account' };
  }

  return { valid: true };
}

export async function accountNeedsWelcomeNear(
  accountId: string
): Promise<boolean> {
  if (!config.welcomeNear.enabled) {
    return false;
  }

  const balance = await viewAccountBalance(accountId);
  if (balance == null) {
    return true;
  }

  try {
    return BigInt(balance) < BigInt(config.welcomeNear.thresholdYocto);
  } catch {
    return true;
  }
}
