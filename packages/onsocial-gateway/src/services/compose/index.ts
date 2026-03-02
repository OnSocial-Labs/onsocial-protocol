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
  /** Optional: additional metadata fields (NEP-177 `extra` — stringified JSON) */
  extra?: Record<string, unknown>;
  /** Number of copies (default 1) */
  copies?: number;
  /** Collection ID for collection-based minting (uses MintFromCollection) */
  collectionId?: string;
  /** Quantity to mint from collection (default 1, only for MintFromCollection) */
  quantity?: number;
  /** Receiver for collection mint (defaults to caller) */
  receiverId?: string;
  /** Royalty map: { "account.near": 2500 } = 25% (only for QuickMint) */
  royalty?: Record<string, number>;
  /** App ID for analytics attribution (only for QuickMint) */
  appId?: string;
  /** Optional: override target account (which scarces contract) */
  targetAccount?: string;
}

export interface ComposeMintResult {
  txHash: string;
  media?: UploadResult;
  metadata?: UploadResult;
}

/** Prepared Set action ready for signing (returned by prepare endpoints). */
export interface SetActionResult {
  action: Record<string, unknown>;
  targetAccount: string;
  uploads: Record<string, UploadResult>;
}

/** Prepared Mint action ready for signing (returned by prepare endpoints). */
export interface MintActionResult {
  action: Record<string, unknown>;
  targetAccount: string;
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

export async function uploadToLighthouse(
  file: UploadedFile
): Promise<UploadResult> {
  const result = await lighthouse.uploadBuffer(file.buffer, getApiKey());
  const cid = result.data.Hash;
  const hash = createHash('sha256').update(file.buffer).digest('base64');

  return {
    cid,
    size: Number(result.data.Size),
    url: `${GATEWAY_URL}/${cid}`,
    hash,
  };
}

export async function uploadJsonToLighthouse(
  data: Record<string, unknown>,
  filename = 'metadata.json'
): Promise<UploadResult> {
  const json = JSON.stringify(data);
  const buffer = Buffer.from(json);
  const result = await lighthouse.uploadText(json, getApiKey(), filename);
  const cid = result.data.Hash;
  const hash = createHash('sha256').update(buffer).digest('base64');

  return {
    cid,
    size: Number(result.data.Size),
    url: `${GATEWAY_URL}/${cid}`,
    hash,
  };
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

async function relayExecute(
  auth: ContractAuth,
  action: Record<string, unknown>,
  targetAccount: string
): Promise<{ ok: boolean; status: number; data: unknown }> {
  const contractRequest = {
    target_account: targetAccount,
    action,
    auth,
  };

  const response = await fetch(`${config.relayUrl}/execute`, {
    method: 'POST',
    headers: relayHeaders(),
    signal: AbortSignal.timeout(30_000),
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

function extractTxHash(data: unknown): string {
  if (typeof data === 'object' && data !== null && 'tx_hash' in data) {
    return String((data as Record<string, unknown>).tx_hash);
  }
  return '';
}

// ---------------------------------------------------------------------------
// Compose: Set (core contract — any path)
// ---------------------------------------------------------------------------

// Max path depth / length (matches core contract limits)
const MAX_PATH_DEPTH = 12;
const MAX_PATH_LENGTH = 256;

function validatePath(path: string): string | null {
  if (path.length > MAX_PATH_LENGTH)
    return `Path exceeds ${MAX_PATH_LENGTH} characters`;
  if (path.split('/').length > MAX_PATH_DEPTH)
    return `Path exceeds ${MAX_PATH_DEPTH} segments`;
  if (path.startsWith('/') || path.endsWith('/'))
    return 'Path must not start or end with /';
  if (/\/\//.test(path)) return 'Path must not contain empty segments';
  return null;
}

/**
 * Build a Set action — uploads files to Lighthouse, injects CIDs into
 * the value, and returns the action object without relaying.
 *
 * Used by:
 *   - composeSet()           → intent auth (server/API-key callers)
 *   - /compose/prepare/set   → returns action for SDK signing (signed_payload)
 */
export async function buildSetAction(
  accountId: string,
  req: ComposeSetRequest,
  files: UploadedFile[]
): Promise<SetActionResult> {
  // 0. Validate path
  const pathError = validatePath(req.path);
  if (pathError) throw new ComposeError(400, pathError);

  // 1. Upload files to Lighthouse (parallel)
  const entries = await Promise.all(
    files.map(async (file) => {
      const result = await uploadToLighthouse(file);
      logger.info(
        {
          accountId,
          cid: result.cid,
          field: file.fieldname,
          size: result.size,
        },
        'Compose: file uploaded to Lighthouse'
      );
      return [file.fieldname, result] as const;
    })
  );
  const uploads: Record<string, UploadResult> = Object.fromEntries(entries);

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

  // 3. Build action (no relay — caller decides auth mode)
  const action = {
    type: 'set',
    data: { [req.path]: value },
  };

  return {
    action,
    targetAccount: req.targetAccount || accountId,
    uploads,
  };
}

/**
 * Compose: Set — uploads files, builds action, relays via intent auth.
 * For signed-payload flow, use buildSetAction() + /relay/signed instead.
 */
export async function composeSet(
  accountId: string,
  req: ComposeSetRequest,
  files: UploadedFile[]
): Promise<ComposeSetResult> {
  const built = await buildSetAction(accountId, req, files);
  const relay = await relayExecute(
    intentAuth(accountId),
    built.action,
    built.targetAccount
  );
  if (!relay.ok) {
    throw new ComposeError(relay.status, relay.data);
  }

  return {
    txHash: extractTxHash(relay.data),
    path: req.path,
    uploads: built.uploads,
  };
}

// ---------------------------------------------------------------------------
// Compose: Mint (scarces contract — NFT)
// ---------------------------------------------------------------------------

/**
 * Build a Mint action — uploads media/metadata to Lighthouse, returns
 * the action object without relaying.
 *
 * Used by:
 *   - composeMint()           → intent auth (server/API-key callers)
 *   - /compose/prepare/mint   → returns action for SDK signing (signed_payload)
 */
export async function buildMintAction(
  accountId: string,
  req: ComposeMintRequest,
  imageFile?: UploadedFile
): Promise<MintActionResult> {
  let media: UploadResult | undefined;

  // 1. Upload image if provided (only for QuickMint — collections have their own metadata)
  if (imageFile && !req.collectionId) {
    media = await uploadToLighthouse(imageFile);
    logger.info(
      { accountId, cid: media.cid, size: media.size },
      'Compose mint: image uploaded to Lighthouse'
    );
  }

  // 2. Build action
  let action: Record<string, unknown>;
  let metadata: UploadResult | undefined;

  if (req.collectionId) {
    // ── MintFromCollection ──────────────────────────────────────────
    // Collection already has metadata/price configured. Caller only
    // specifies collection_id, quantity, and optional receiver_id.
    action = {
      type: 'mint_from_collection',
      collection_id: req.collectionId,
      quantity: req.quantity ?? 1,
      ...(req.receiverId && { receiver_id: req.receiverId }),
    };
  } else {
    // ── QuickMint ──────────────────────────────────────────────────
    // Build NEP-177 metadata for a standalone (non-collection) mint.
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

    metadata = await uploadJsonToLighthouse(fullMetadata);
    tokenMetadata.reference = `ipfs://${metadata.cid}`;
    tokenMetadata.reference_hash = metadata.hash;

    // ScarceOptions fields are #[serde(flatten)]'d — they go at root level
    action = {
      type: 'quick_mint',
      metadata: tokenMetadata,
      ...(req.royalty && { royalty: req.royalty }),
      ...(req.appId && { app_id: req.appId }),
    };
  }

  // 4. Resolve target account
  const targetAccount =
    req.targetAccount ||
    (config.nearNetwork === 'mainnet'
      ? 'scarces.onsocial.near'
      : 'scarces.onsocial.testnet');

  return { action, targetAccount, media, metadata };
}

/**
 * Compose: Mint — uploads media/metadata, builds action, relays via intent auth.
 * For signed-payload flow, use buildMintAction() + /relay/signed instead.
 */
export async function composeMint(
  accountId: string,
  req: ComposeMintRequest,
  imageFile?: UploadedFile
): Promise<ComposeMintResult> {
  const built = await buildMintAction(accountId, req, imageFile);
  const relay = await relayExecute(
    intentAuth(accountId),
    built.action,
    built.targetAccount
  );
  if (!relay.ok) {
    throw new ComposeError(relay.status, relay.data);
  }

  return {
    txHash: extractTxHash(relay.data),
    media: built.media,
    metadata: built.metadata,
  };
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
