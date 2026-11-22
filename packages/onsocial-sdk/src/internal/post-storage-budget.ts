import { acceptedPosterCid } from './poster-cid.js';

// Sponsored post writes are capped by the core contract's platform allowance.
// Testnet config: platform_allowance_max_bytes 6000, max_value_bytes 10240.
//
// `env::storage_usage()` inside the contract (near-vm-runner VMLogic) grows by
// key bytes + value bytes + storage_num_extra_bytes_record (40) for a new key.
// The value is borsh(DataEntry): 1-byte enum tag + u32 length + JSON + u64
// block height, so the JSON is wrapped in 13 extra bytes.
//
// Measured maximum composer group reply on the charged key
// `{author}/groups/{id}/content/post/{id}` (64-char author and group ids,
// 13-digit post id, 4000-char text, 80-char warning, 64-char place and channel,
// 128-char audience, 4 videos at the 200MB / 7680×4320 composer caps):
//   with 4×128-char stills: 6101 bytes (over the 6000 allowance)
//   without stills:         5541 bytes
// The 5700 cap stays: 5541 and 5700 are both under 6000, and the stills
// that cross the allowance are dropped.

export const SOCIAL_STORAGE_RECORD_OVERHEAD = 40;
export const DATA_ENTRY_BORSH_OVERHEAD = 13;
export const POST_STORAGE_BUDGET_BYTES = 5700;
const MAX_STORAGE_KEY_BYTES = 256;
const MAX_ACCOUNT_ID_CHARS = 64;

export function personalPostStorageKey(postId: string): string {
  const key = `${'a'.repeat(MAX_ACCOUNT_ID_CHARS)}/post/${postId}`;
  return key.length <= MAX_STORAGE_KEY_BYTES
    ? key
    : key.slice(0, MAX_STORAGE_KEY_BYTES);
}

/**
 * Storage key the core contract charges for a group post:
 * `{author}/groups/{groupId}/content/post/{postId}`.
 * Uses the signer when the builder knows it; otherwise a 64-char account.
 */
export function groupPostStorageKey(
  groupId: string,
  postId: string,
  authorId?: string
): string {
  const author =
    typeof authorId === 'string' &&
    authorId.length > 0 &&
    authorId.length <= MAX_ACCOUNT_ID_CHARS
      ? authorId
      : 'a'.repeat(MAX_ACCOUNT_ID_CHARS);
  const key = `${author}/groups/${groupId}/content/post/${postId}`;
  return key.length <= MAX_STORAGE_KEY_BYTES
    ? key
    : key.slice(0, MAX_STORAGE_KEY_BYTES);
}

export function socialStorageUsage(storageKey: string, value: unknown): number {
  const keyBytes = Math.min(
    new TextEncoder().encode(storageKey).length,
    MAX_STORAGE_KEY_BYTES
  );
  const json = JSON.stringify(value);
  const jsonBytes = new TextEncoder().encode(json).length;
  return (
    keyBytes +
    jsonBytes +
    DATA_ENTRY_BORSH_OVERHEAD +
    SOCIAL_STORAGE_RECORD_OVERHEAD
  );
}

/**
 * Drop posters that are not a CIDv0/v1 (bare or `ipfs://`) of at most 128
 * characters. A valid `ipfs://` poster is stored as the bare CID. The video
 * ref stays. Runs before the storage budget so a rejected still never counts.
 */
export function stripUnacceptedPosters<T>(value: T): T {
  if (!value || typeof value !== 'object') return value;
  const media = (value as { media?: unknown }).media;
  if (!Array.isArray(media)) return value;
  let changed = false;
  const nextMedia = media.map((item) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return item;
    if (!('poster' in item)) return item;
    const raw = (item as { poster?: unknown }).poster;
    if (raw === undefined) return item;
    const accepted = typeof raw === 'string' ? acceptedPosterCid(raw) : null;
    if (accepted && accepted === raw) return item;
    changed = true;
    if (!accepted) {
      const { poster: _poster, ...rest } = item as Record<string, unknown>;
      return rest;
    }
    return { ...(item as Record<string, unknown>), poster: accepted };
  });
  if (!changed) return value;
  return { ...(value as object), media: nextMedia } as T;
}

function withoutPoster(item: unknown): unknown {
  if (!item || typeof item !== 'object' || Array.isArray(item)) return item;
  if (!('poster' in item)) return item;
  const { poster: _poster, ...rest } = item as Record<string, unknown>;
  return rest;
}

/** Drop every MediaRef.poster when the composed value would exceed the budget. */
export function omitPostersOverStorageBudget<T>(
  value: T,
  storageKey: string
): T {
  if (socialStorageUsage(storageKey, value) <= POST_STORAGE_BUDGET_BYTES) {
    return value;
  }
  if (!value || typeof value !== 'object') return value;
  const media = (value as { media?: unknown }).media;
  if (!Array.isArray(media)) return value;
  let stripped = false;
  const nextMedia = media.map((item) => {
    if (
      item &&
      typeof item === 'object' &&
      !Array.isArray(item) &&
      'poster' in item
    ) {
      stripped = true;
    }
    return withoutPoster(item);
  });
  if (!stripped) return value;
  return { ...(value as object), media: nextMedia } as T;
}
