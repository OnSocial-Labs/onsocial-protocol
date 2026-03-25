import { randomBytes } from 'crypto';
import nacl from 'tweetnacl';
import { config } from '../config/index.js';
import { logger } from '../logger.js';

const CLAIM_PREFIX = 'OnSocial Partner Key Claim';
const CLAIM_RECIPIENT = 'OnSocial Partner Portal';
const CLAIM_TTL_MS = 5 * 60 * 1000;

interface ParsedClaimMessage {
  walletId: string;
  appId: string;
  nonce: string;
  issuedAt: string;
  expiresAt: string;
  network: string;
}

export interface PartnerKeyClaimChallenge {
  app_id: string;
  wallet_id: string;
  recipient: string;
  nonce: string;
  message: string;
  issued_at: string;
  expires_at: string;
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

function createClaimMessage(input: {
  walletId: string;
  appId: string;
  nonce: string;
  issuedAt: string;
  expiresAt: string;
}): string {
  return [
    CLAIM_PREFIX,
    `Wallet: ${input.walletId}`,
    `App: ${input.appId}`,
    `Nonce: ${input.nonce}`,
    `Issued At: ${input.issuedAt}`,
    `Expires At: ${input.expiresAt}`,
    `Network: ${config.nearNetwork}`,
  ].join('\n');
}

function parseClaimMessage(message: string): ParsedClaimMessage | null {
  const lines = message.split('\n');
  if (lines.length !== 7 || lines[0] !== CLAIM_PREFIX) {
    return null;
  }

  const walletId = lines[1]?.replace(/^Wallet: /, '');
  const appId = lines[2]?.replace(/^App: /, '');
  const nonce = lines[3]?.replace(/^Nonce: /, '');
  const issuedAt = lines[4]?.replace(/^Issued At: /, '');
  const expiresAt = lines[5]?.replace(/^Expires At: /, '');
  const network = lines[6]?.replace(/^Network: /, '');

  if (!walletId || !appId || !nonce || !issuedAt || !expiresAt || !network) {
    return null;
  }

  return { walletId, appId, nonce, issuedAt, expiresAt, network };
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
        id: 'onsocial-partner-key-claim',
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
    logger.error(
      { accountId, error },
      'Failed to verify partner key ownership'
    );
    return false;
  }
}

export function buildPartnerKeyClaimChallenge(
  walletId: string,
  appId: string,
  now = Date.now()
): PartnerKeyClaimChallenge {
  const issuedAt = new Date(now).toISOString();
  const expiresAt = new Date(now + CLAIM_TTL_MS).toISOString();
  const nonce = randomBytes(32).toString('base64');

  return {
    app_id: appId,
    wallet_id: walletId,
    recipient: CLAIM_RECIPIENT,
    nonce,
    message: createClaimMessage({
      walletId,
      appId,
      nonce,
      issuedAt,
      expiresAt,
    }),
    issued_at: issuedAt,
    expires_at: expiresAt,
  };
}

export async function verifyPartnerKeyClaim(input: {
  expectedWalletId: string;
  expectedAppId: string;
  accountId: string;
  publicKey: string;
  signature: string;
  message: string;
}): Promise<{ valid: boolean; error?: string }> {
  if (input.accountId !== input.expectedWalletId) {
    return { valid: false, error: 'Wallet mismatch' };
  }

  const parsed = parseClaimMessage(input.message);
  if (!parsed) {
    return { valid: false, error: 'Invalid claim message' };
  }

  if (parsed.walletId !== input.expectedWalletId) {
    return { valid: false, error: 'Claim message wallet mismatch' };
  }

  if (parsed.appId !== input.expectedAppId) {
    return { valid: false, error: 'Claim message app mismatch' };
  }

  if (parsed.network !== config.nearNetwork) {
    return { valid: false, error: 'Claim message network mismatch' };
  }

  let nonceBytes: Uint8Array;
  try {
    nonceBytes = decodeBase64(parsed.nonce);
  } catch {
    return { valid: false, error: 'Invalid claim nonce' };
  }

  if (nonceBytes.length !== 32) {
    return { valid: false, error: 'Invalid claim nonce length' };
  }

  const issuedAtMs = Date.parse(parsed.issuedAt);
  const expiresAtMs = Date.parse(parsed.expiresAt);
  if (!Number.isFinite(issuedAtMs) || !Number.isFinite(expiresAtMs)) {
    return { valid: false, error: 'Invalid claim timestamps' };
  }

  const now = Date.now();
  if (issuedAtMs > now + 60_000) {
    return { valid: false, error: 'Claim timestamp is in the future' };
  }

  if (expiresAtMs < now) {
    return { valid: false, error: 'Claim has expired' };
  }

  if (expiresAtMs - issuedAtMs > CLAIM_TTL_MS + 1_000) {
    return { valid: false, error: 'Claim validity window is invalid' };
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

  const messageBytes = new TextEncoder().encode(input.message);
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
