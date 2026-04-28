/**
 * Shared types, helpers, and Lighthouse upload utilities for the compose service.
 *
 * All feature modules (set, mint, collection) import from here.
 */

import lighthouse from '@lighthouse-web3/sdk';
import { createHash } from 'node:crypto';
import { config } from '../../config/index.js';
import { logger } from '../../logger.js';
import type { ContractAuth, IntentAuth } from '../../types/index.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface UploadedFile {
  fieldname: string;
  originalname: string;
  buffer: Buffer;
  mimetype: string;
  size: number;
}

export interface UploadResult {
  cid: string;
  size: number;
  url: string;
  /** SHA-256 hash of the uploaded content (base64) */
  hash: string;
}

// ---------------------------------------------------------------------------
// ComposeError
// ---------------------------------------------------------------------------

export class ComposeError extends Error {
  constructor(
    public status: number,
    public details: unknown
  ) {
    super(typeof details === 'string' ? details : JSON.stringify(details));
    this.name = 'ComposeError';
  }
}

// ---------------------------------------------------------------------------
// Lighthouse upload
// ---------------------------------------------------------------------------

/** Resolve a CID to an HTTP URL via the configured public IPFS gateway. */
export function gatewayUrl(cid: string): string {
  return `${config.lighthouseGatewayBase.replace(/\/+$/, '')}/${cid}`;
}

/** Build the canonical `ipfs://<cid>` URI (gateway-agnostic). */
export function ipfsUri(cid: string): string {
  return `ipfs://${cid}`;
}

function getApiKey(): string {
  const key = config.lighthouseApiKey;
  if (!key) throw new Error('LIGHTHOUSE_API_KEY not configured');
  return key;
}

// Per-upload storage tier sent to the pinning provider.
const STORAGE_TYPE = process.env.LIGHTHOUSE_STORAGE_TYPE || 'annual';
const uploadOpts = { headers: { storageType: STORAGE_TYPE } };

/**
 * Verify a freshly-uploaded CID is retrievable through the configured
 * gateway before the caller commits an on-chain reference to it.
 */
export async function verifyCidLive(cid: string, retries = 3): Promise<void> {
  let lastErr: unknown;
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(gatewayUrl(cid), {
        method: 'HEAD',
        signal: AbortSignal.timeout(5_000),
      });
      if (res.ok) return;
      lastErr = `HEAD ${cid} → ${res.status}`;
    } catch (err) {
      lastErr = err;
    }
    await new Promise((r) => setTimeout(r, 500 * 2 ** i));
  }
  throw new ComposeError(
    502,
    `CID ${cid} not retrievable through gateway after ${retries} attempts: ${String(lastErr)}`
  );
}

export async function uploadToLighthouse(
  file: UploadedFile
): Promise<UploadResult> {
  const result = await lighthouse.uploadBuffer(
    file.buffer,
    getApiKey(),
    uploadOpts
  );
  const cid = result.data.Hash;
  const hash = createHash('sha256').update(file.buffer).digest('base64');

  return {
    cid,
    size: Number(result.data.Size),
    url: gatewayUrl(cid),
    hash,
  };
}

export async function uploadJsonToLighthouse(
  data: Record<string, unknown>,
  filename = 'metadata.json'
): Promise<UploadResult> {
  const json = JSON.stringify(data);
  const buffer = Buffer.from(json);
  const result = await lighthouse.uploadText(
    json,
    getApiKey(),
    filename,
    uploadOpts
  );
  const cid = result.data.Hash;
  const hash = createHash('sha256').update(buffer).digest('base64');

  return {
    cid,
    size: Number(result.data.Size),
    url: gatewayUrl(cid),
    hash,
  };
}

/**
 * Upload an SVG. Uses `.svg` filename so the gateway serves it with
 * `image/svg+xml` content-type.
 */
export async function uploadSvgToLighthouse(
  svg: string,
  filename = 'card.svg'
): Promise<UploadResult> {
  const buffer = Buffer.from(svg);
  const result = await lighthouse.uploadText(
    svg,
    getApiKey(),
    filename,
    uploadOpts
  );
  const cid = result.data.Hash;
  const hash = createHash('sha256').update(buffer).digest('base64');

  return {
    cid,
    size: Number(result.data.Size),
    url: gatewayUrl(cid),
    hash,
  };
}

/**
 * Encode an SVG as a `data:image/svg+xml;base64,...` URI.
 *
 * Returns the same `UploadResult` shape as the upload helpers; `cid` is
 * empty because nothing is stored externally.
 */
export function inlineSvgAsDataUri(svg: string): UploadResult {
  const buffer = Buffer.from(svg);
  const base64 = buffer.toString('base64');
  return {
    cid: '',
    size: buffer.byteLength,
    url: `data:image/svg+xml;base64,${base64}`,
    hash: createHash('sha256').update(buffer).digest('base64'),
  };
}

// ---------------------------------------------------------------------------
// Validation helpers (shared by mint + collection)
// ---------------------------------------------------------------------------

/** Max metadata bytes (contract constant MAX_METADATA_LEN). */
export const MAX_METADATA_LEN = 16_384;
/** Max royalty basis points (50%). */
export const MAX_ROYALTY_BPS = 5_000;
/** Max royalty recipients. */
export const MAX_ROYALTY_RECIPIENTS = 10;
/** Max collection supply. */
export const MAX_COLLECTION_SUPPLY = 100_000;

/**
 * Validate a royalty map against contract rules.
 * Returns null if valid, or an error message string.
 */
export function validateRoyalty(
  royalty: Record<string, number> | undefined
): string | null {
  if (!royalty) return null;
  const entries = Object.entries(royalty);
  if (entries.length > MAX_ROYALTY_RECIPIENTS)
    return `Maximum ${MAX_ROYALTY_RECIPIENTS} royalty recipients`;
  let total = 0;
  for (const [, bps] of entries) {
    if (bps <= 0) return 'Each royalty share must be > 0 bps';
    total += bps;
  }
  if (total > MAX_ROYALTY_BPS)
    return `Total royalty ${total} bps exceeds max ${MAX_ROYALTY_BPS} bps (50%)`;
  return null;
}

// ---------------------------------------------------------------------------
// Simple action result (used by all non-upload action builders)
// ---------------------------------------------------------------------------

export interface SimpleActionResult {
  action: Record<string, unknown>;
  targetAccount: string;
}

/** Resolve the core contract account for the current network. */
export function resolveCoreTarget(override?: string): string {
  return (
    override ||
    (config.nearNetwork === 'mainnet'
      ? 'core.onsocial.near'
      : 'core.onsocial.testnet')
  );
}

/** Resolve the scarces contract account for the current network. */
export function resolveScarcesTarget(override?: string): string {
  return (
    override ||
    (config.nearNetwork === 'mainnet'
      ? 'scarces.onsocial.near'
      : 'scarces.onsocial.testnet')
  );
}

// ---------------------------------------------------------------------------
// NEAR helpers
// ---------------------------------------------------------------------------

/** Convert NEAR amount string (e.g. "1.5") to yoctoNEAR string for the contract. */
export function nearToYocto(near: string): string {
  const parts = near.split('.');
  const whole = parts[0] || '0';
  const frac = (parts[1] || '').padEnd(24, '0').slice(0, 24);
  return (
    BigInt(whole) * BigInt('1000000000000000000000000') + BigInt(frac) + ''
  );
}

// ---------------------------------------------------------------------------
// Relay helpers
// ---------------------------------------------------------------------------

function relayHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (config.relayApiKey) {
    headers['X-Api-Key'] = config.relayApiKey;
  }
  return headers;
}

/** Build an intent auth block (gateway acts on behalf of user via relayer). */
export function intentAuth(actorId: string): IntentAuth {
  return { type: 'intent', actor_id: actorId, intent: {} };
}

export async function relayExecute(
  auth: ContractAuth,
  action: Record<string, unknown>,
  targetAccount: string,
  opts: { wait?: boolean } = {}
): Promise<{ ok: boolean; status: number; data: unknown }> {
  const contractRequest = {
    target_account: targetAccount,
    action,
    auth,
  };

  // wait=true → relayer uses broadcast_tx_commit and surfaces inner-action
  // failures as { success: false, status: 'failure', error, tx_hash } instead
  // of fire-and-forget pending. Required for compose writes whose callers
  // (SDK, integration tests) need to know the on-chain outcome.
  const url = opts.wait
    ? `${config.relayUrl}/execute?wait=true`
    : `${config.relayUrl}/execute`;
  const timeoutMs = opts.wait ? 90_000 : 30_000;

  const response = await fetch(url, {
    method: 'POST',
    headers: relayHeaders(),
    signal: AbortSignal.timeout(timeoutMs),
    body: JSON.stringify(contractRequest),
  });

  let data: unknown;
  try {
    data = await response.json();
  } catch {
    const text = await response.text().catch(() => '(empty)');
    data = { error: 'Relay returned non-JSON response', raw: text };
  }
  return { ok: response.ok, status: response.status, data };
}

export function extractTxHash(data: unknown): string {
  if (typeof data === 'object' && data !== null && 'tx_hash' in data) {
    return String((data as Record<string, unknown>).tx_hash);
  }
  return '';
}

export { logger };
