/**
 * Compose service — chains Lighthouse storage + relay into atomic operations.
 *
 * Developers call one endpoint; the gateway handles:
 *   1. Upload media/files to Lighthouse (IPFS + Filecoin)
 *   2. Build the contract action with ipfs:// CIDs injected
 *   3. Forward to the relayer for gasless on-chain execution
 *   4. Return tx_hash + CIDs in a single response
 *
 * No per-tier upload limits — rate limiting IS the billing mechanism.
 * The gateway-wide rate limiter (60/min free, 600/min pro) naturally
 * caps upload volume without needing a second metering layer.
 *
 * Path-agnostic: works with any core contract path (posts, profiles,
 * groups, custom app data) and any scarces mint flow.
 */

import lighthouse from '@lighthouse-web3/sdk';
import { createHash } from 'node:crypto';
import { config } from '../../config/index.js';
import { logger } from '../../logger.js';

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

export interface ComposeSetRequest {
  /** Slash-delimited path (e.g. "post/main", "groups/dao/media/photo1") */
  path: string;
  /** JSON value to store at the path */
  value: Record<string, unknown>;
  /** Optional: which field(s) in value should receive the uploaded file CID */
  mediaField?: string;
  /** Optional: override target account for cross-account writes */
  targetAccount?: string;
}

export interface ComposeSetResult {
  txHash: string;
  path: string;
  uploads: Record<string, UploadResult>;
}

export interface ComposeMintRequest {
  title: string;
  description?: string;
  /** Optional: additional metadata fields */
  extra?: Record<string, unknown>;
  /** Price in yoctoNEAR (string for u128 precision) */
  price?: string;
  /** Number of copies (default 1) */
  copies?: number;
  /** Collection ID for collection-based minting */
  collectionId?: string;
  /** Optional: override target account (which scarces contract) */
  targetAccount?: string;
}

export interface ComposeMintResult {
  txHash: string;
  media?: UploadResult;
  metadata?: UploadResult;
}

// ---------------------------------------------------------------------------
// Lighthouse upload
// ---------------------------------------------------------------------------

const GATEWAY_URL = 'https://gateway.lighthouse.storage/ipfs';

function getApiKey(): string {
  const key = config.lighthouseApiKey;
  if (!key) throw new Error('LIGHTHOUSE_API_KEY not configured');
  return key;
}

export async function uploadToLighthouse(file: UploadedFile): Promise<UploadResult> {
  const result = await lighthouse.uploadBuffer(file.buffer, getApiKey());
  const cid = result.data.Hash;
  const hash = createHash('sha256').update(file.buffer).digest('base64');

  return {
    cid,
    size: result.data.Size,
    url: `${GATEWAY_URL}/${cid}`,
    hash,
  };
}

export async function uploadJsonToLighthouse(
  data: Record<string, unknown>,
  filename = 'metadata.json',
): Promise<UploadResult> {
  const json = JSON.stringify(data);
  const buffer = Buffer.from(json);
  const result = await lighthouse.uploadText(json, getApiKey(), filename);
  const cid = result.data.Hash;
  const hash = createHash('sha256').update(buffer).digest('base64');

  return {
    cid,
    size: result.data.Size,
    url: `${GATEWAY_URL}/${cid}`,
    hash,
  };
}

// ---------------------------------------------------------------------------
// Relay helpers
// ---------------------------------------------------------------------------

function relayHeaders(): Record<string, string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (config.relayApiKey) {
    headers['X-Api-Key'] = config.relayApiKey;
  }
  return headers;
}

async function relayExecute(
  accountId: string,
  action: Record<string, unknown>,
  targetAccount?: string,
): Promise<{ ok: boolean; status: number; data: unknown }> {
  const contractRequest = {
    target_account: targetAccount || accountId,
    action,
    auth: {
      type: 'intent',
      actor_id: accountId,
      intent: {},
    },
  };

  const response = await fetch(`${config.relayUrl}/execute`, {
    method: 'POST',
    headers: relayHeaders(),
    signal: AbortSignal.timeout(30_000),
    body: JSON.stringify(contractRequest),
  });

  const data = await response.json();
  return { ok: response.ok, status: response.status, data };
}

function extractTxHash(data: unknown): string {
  if (typeof data === 'object' && data !== null && 'tx_hash' in data) {
    return String((data as Record<string, unknown>).tx_hash);
  }
  return '';
}

// ---------------------------------------------------------------------------
// Compose: Set (core contract — any path)
// ---------------------------------------------------------------------------

export async function composeSet(
  accountId: string,
  req: ComposeSetRequest,
  files: UploadedFile[],
): Promise<ComposeSetResult> {
  // 1. Upload files to Lighthouse
  const uploads: Record<string, UploadResult> = {};
  for (const file of files) {
    const result = await uploadToLighthouse(file);
    uploads[file.fieldname] = result;
    logger.info(
      { accountId, cid: result.cid, field: file.fieldname, size: result.size },
      'Compose: file uploaded to Lighthouse',
    );
  }

  // 2. Inject CIDs into value
  const value = { ...req.value };

  if (req.mediaField && files.length > 0) {
    // Single mediaField mode: inject first uploaded file's CID
    const firstUpload = Object.values(uploads)[0];
    value[req.mediaField] = `ipfs://${firstUpload.cid}`;
    value[`${req.mediaField}_hash`] = firstUpload.hash;
  } else if (files.length > 0 && !req.mediaField) {
    // Auto mode: use fieldname as the JSON key for each file's CID
    for (const [fieldname, upload] of Object.entries(uploads)) {
      value[fieldname] = `ipfs://${upload.cid}`;
      value[`${fieldname}_hash`] = upload.hash;
    }
  }

  // 3. Relay to core contract
  const action = {
    type: 'Set',
    data: { [req.path]: value },
  };

  const relay = await relayExecute(accountId, action, req.targetAccount);
  if (!relay.ok) {
    throw new ComposeError(relay.status, relay.data);
  }

  return { txHash: extractTxHash(relay.data), path: req.path, uploads };
}

// ---------------------------------------------------------------------------
// Compose: Mint (scarces contract — NFT)
// ---------------------------------------------------------------------------

export async function composeMint(
  accountId: string,
  req: ComposeMintRequest,
  imageFile?: UploadedFile,
): Promise<ComposeMintResult> {
  let media: UploadResult | undefined;

  // 1. Upload image if provided
  if (imageFile) {
    media = await uploadToLighthouse(imageFile);
    logger.info(
      { accountId, cid: media.cid, size: media.size },
      'Compose mint: image uploaded to Lighthouse',
    );
  }

  // 2. Build NEP-177 metadata
  const tokenMetadata: Record<string, unknown> = {
    title: req.title,
    ...(req.description && { description: req.description }),
    ...(media && { media: `ipfs://${media.cid}` }),
    ...(media && { media_hash: media.hash }),
    ...(req.copies && { copies: req.copies }),
    ...(req.extra && { extra: JSON.stringify(req.extra) }),
  };

  // 3. Upload full metadata JSON to Lighthouse (OpenSea-compatible)
  const fullMetadata = {
    ...tokenMetadata,
    ...(media && { image: `ipfs://${media.cid}` }),
    name: req.title,
    ...(req.description && { description: req.description }),
    ...(req.extra || {}),
  };

  const metadata = await uploadJsonToLighthouse(fullMetadata);
  tokenMetadata.reference = `ipfs://${metadata.cid}`;
  tokenMetadata.reference_hash = metadata.hash;

  // 4. Build mint action
  const action: Record<string, unknown> = req.collectionId
    ? {
        type: 'MintFromCollection',
        collection_id: req.collectionId,
        metadata: tokenMetadata,
        ...(req.price && { price: req.price }),
      }
    : {
        type: 'QuickMint',
        metadata: tokenMetadata,
        options: {
          ...(req.price && { price: req.price }),
        },
      };

  // 5. Relay to scarces contract
  const targetAccount =
    req.targetAccount ||
    (config.nearNetwork === 'mainnet'
      ? 'scarces.onsocial.near'
      : 'scarces.onsocial.testnet');

  const relay = await relayExecute(accountId, action, targetAccount);
  if (!relay.ok) {
    throw new ComposeError(relay.status, relay.data);
  }

  return { txHash: extractTxHash(relay.data), media, metadata };
}

// ---------------------------------------------------------------------------
// ComposeError
// ---------------------------------------------------------------------------

export class ComposeError extends Error {
  constructor(
    public status: number,
    public details: unknown,
  ) {
    super(typeof details === 'string' ? details : JSON.stringify(details));
    this.name = 'ComposeError';
  }
}
