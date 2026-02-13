/**
 * GCP Cloud KMS signer for near-api-js v7.
 * Signs NEAR transactions via KMS Ed25519 (PureEdDSA). Private keys never leave the HSM.
 * Auth: `gcloud auth print-access-token`.
 */
import { execSync } from 'child_process';
import { PublicKey, Signer } from 'near-api-js';

const KMS_BASE = 'https://cloudkms.googleapis.com/v1';

/**
 * Extends near-api-js Signer. Delegates signBytes() to KMS asymmetricSign.
 */
export class KmsSigner extends Signer {
  #resourceName;    // Full CryptoKeyVersion resource path
  #publicKey;       // near-api-js PublicKey
  #accessToken;     // Cached OAuth2 token
  #tokenExpiry = 0; // Token expiry timestamp (ms)

  constructor(resourceName, publicKey) {
    super();
    this.#resourceName = resourceName;
    this.#publicKey = publicKey;
  }

  /**
   * Factory: creates a KmsSigner and fetches the public key from KMS.
   */
  static async create({ project, location, keyring, keyName, version = 1 }) {
    const resourceName =
      `projects/${project}/locations/${location}/keyRings/${keyring}/cryptoKeys/${keyName}/cryptoKeyVersions/${version}`;
    const token = getAccessToken();

    const resp = await fetch(`${KMS_BASE}/${resourceName}/publicKey`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!resp.ok) {
      throw new Error(`KMS getPublicKey failed: ${resp.status} ${await resp.text()}`);
    }
    const { pem } = await resp.json();

    // PEM → raw 32-byte Ed25519 public key
    const b64 = pem
      .replace(/-----BEGIN PUBLIC KEY-----/, '')
      .replace(/-----END PUBLIC KEY-----/, '')
      .replace(/\s/g, '');
    const der = Buffer.from(b64, 'base64');
    // Ed25519 DER: 12-byte header + 32-byte key
    const rawKey = der.subarray(der.length - 32);
    const bs58Alphabet = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
    const nearPk = PublicKey.from(`ed25519:${base58Encode(rawKey, bs58Alphabet)}`);

    console.log(`KMS signer ready: ${nearPk} (${keyring}/${keyName})`);

    const signer = new KmsSigner(resourceName, nearPk);
    signer.#accessToken = token;
    signer.#tokenExpiry = Date.now() + 55 * 60 * 1000; // ~55 min
    return signer;
  }

  /** near-api-js Signer interface. */
  async getPublicKey() {
    return this.#publicKey;
  }

  /** Sign raw bytes via KMS asymmetricSign. */
  async signBytes(message) {
    const token = this.#getToken();
    const data = Buffer.from(message).toString('base64');

    const resp = await fetch(`${KMS_BASE}/${this.#resourceName}:asymmetricSign`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ data }),
    });

    if (!resp.ok) {
      throw new Error(`KMS sign failed: ${resp.status} ${await resp.text()}`);
    }

    const { signature: sigB64 } = await resp.json();
    const signature = new Uint8Array(Buffer.from(sigB64, 'base64'));

    if (signature.length !== 64) {
      throw new Error(`KMS returned ${signature.length}-byte signature (expected 64)`);
    }

    return signature;
  }

  /** Refresh token if expired. */
  #getToken() {
    if (Date.now() > this.#tokenExpiry) {
      this.#accessToken = getAccessToken();
      this.#tokenExpiry = Date.now() + 55 * 60 * 1000;
    }
    return this.#accessToken;
  }
}

/** Get OAuth2 token via gcloud CLI. */
function getAccessToken() {
  return execSync('gcloud auth print-access-token', { encoding: 'utf8' }).trim();
}

/** Encode bytes to base58. */
function base58Encode(bytes, alphabet) {
  const digits = [0];
  for (const byte of bytes) {
    let carry = byte;
    for (let j = 0; j < digits.length; j++) {
      carry += digits[j] << 8;
      digits[j] = carry % 58;
      carry = (carry / 58) | 0;
    }
    while (carry > 0) {
      digits.push(carry % 58);
      carry = (carry / 58) | 0;
    }
  }
  // Leading zeros
  let output = '';
  for (const byte of bytes) {
    if (byte !== 0) break;
    output += alphabet[0];
  }
  for (let i = digits.length - 1; i >= 0; i--) {
    output += alphabet[digits[i]];
  }
  return output;
}
