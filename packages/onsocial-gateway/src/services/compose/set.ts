/**
 * Compose: Set — store content at any core contract path with optional media.
 */

import {
  type UploadedFile,
  type UploadResult,
  ComposeError,
  uploadToLighthouse,
  intentAuth,
  relayExecute,
  extractTxHash,
  resolveCoreTarget,
  logger,
} from './shared.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ComposeSetRequest {
  /** Slash-delimited path (e.g. "post/main", "groups/dao/media/photo1") */
  path: string;
  /** JSON value to store at the path, or null to tombstone (remove) the key */
  value: Record<string, unknown> | null;
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

/** Prepared Set action ready for signing (returned by prepare endpoints). */
export interface SetActionResult {
  action: Record<string, unknown>;
  targetAccount: string;
  uploads: Record<string, UploadResult>;
}

// ---------------------------------------------------------------------------
// Path validation
// ---------------------------------------------------------------------------

// Max path depth / length (matches core contract defaults)
const MAX_PATH_DEPTH = 12;
const MAX_PATH_LENGTH = 256;

/** Allowed path characters: alphanumeric, underscore, dot, hyphen, slash. */
const PATH_CHARS = /^[a-zA-Z0-9_.\-/]+$/;

/**
 * Validate a user-supplied path against core-contract rules.
 *
 * The contract allows trailing slashes (subtree-style) so we do too.
 * See contracts/core-onsocial/src/validation/path.rs for the canonical checks.
 */
export function validatePath(path: string, accountId?: string): string | null {
  if (!path) return 'Path must not be empty';
  if (path.length > MAX_PATH_LENGTH)
    return `Path exceeds ${MAX_PATH_LENGTH} characters`;
  if (path.startsWith('/')) return 'Path must not start with /';
  // Traversal / back-slash protection (is_safe_path)
  if (path.includes('..')) return 'Path must not contain ".."';
  if (path.includes('\\')) return 'Path must not contain backslashes';
  if (
    path === '.' ||
    path.startsWith('./') ||
    path.includes('/./') ||
    path.endsWith('/.')
  )
    return 'Path must not contain dot-segments';
  // Character whitelist
  if (!PATH_CHARS.test(path))
    return 'Path contains invalid characters (allowed: a-z A-Z 0-9 _ . - /)';
  // Consecutive slashes
  if (path.includes('//')) return 'Path must not contain empty segments (//) ';
  // Reserved bare paths
  if (path === 'groups' || path === 'groups/')
    return '"groups" is not a valid data path';
  // Full path length (account_id/path) — contract prepends account if needed
  if (accountId) {
    const needsPrefix =
      !path.startsWith('groups/') &&
      !(path.startsWith(accountId) && path[accountId.length] === '/');
    const fullLen = needsPrefix
      ? accountId.length + 1 + path.length
      : path.length;
    if (fullLen > MAX_PATH_LENGTH)
      return `Full path (account + path) exceeds ${MAX_PATH_LENGTH} characters`;
  }
  // Depth (contract counts on full_path after normalization)
  const segments = path.split('/').filter((s) => s.length > 0);
  // If the contract will prepend accountId, that adds 1 segment
  const extraDepth =
    accountId &&
    !path.startsWith('groups/') &&
    !(path.startsWith(accountId) && path[accountId.length] === '/')
      ? 1
      : 0;
  if (segments.length + extraDepth > MAX_PATH_DEPTH)
    return `Path depth exceeds ${MAX_PATH_DEPTH} segments`;
  return null;
}

// ---------------------------------------------------------------------------
// Build + Compose
// ---------------------------------------------------------------------------

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
  // 0. Validate path (pass accountId so full-path length can be checked)
  const pathError = validatePath(req.path, accountId);
  if (pathError) throw new ComposeError(400, pathError);

  // 0b. Tombstone (null value) — removes the key from contract state.
  // No file uploads, no scattered-key detection: just emit { path: null }.
  if (req.value === null) {
    const action = { type: 'set', data: { [req.path]: null } };
    return {
      action,
      targetAccount: req.targetAccount || resolveCoreTarget(),
      uploads: {},
    };
  }

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
  //
  // Scattered-key detection: when every value key already starts with
  // `path/` (e.g. profile writes produce "profile/name", "profile/bio"),
  // use the value entries directly as flat top-level data keys instead of
  // wrapping them under the path. The contract expects flat slash-keys
  // like "profile/name" — wrapping would produce the invalid "profile"
  // top-level key (no slash) and double-prefix the inner keys.
  const valueKeys = Object.keys(value);
  const isScattered =
    valueKeys.length > 0 &&
    valueKeys.every((k) => k.startsWith(req.path + '/'));

  const action = {
    type: 'set',
    data: isScattered ? value : { [req.path]: value },
  };

  return {
    action,
    targetAccount: req.targetAccount || resolveCoreTarget(),
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
