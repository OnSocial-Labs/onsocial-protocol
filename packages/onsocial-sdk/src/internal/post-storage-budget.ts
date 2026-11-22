// Sponsored post writes are capped by the core contract's platform allowance.
// Testnet config: platform_allowance_max_bytes 6000, max_value_bytes 10240.
//
// `env::storage_usage()` inside the contract (near-vm-runner VMLogic) grows by
// key bytes + value bytes + storage_num_extra_bytes_record (40) for a new key.
// The value is borsh(DataEntry): 1-byte enum tag + u32 length + JSON + u64
// block height, so the JSON is wrapped in 13 extra bytes.
//
// Measured maximum composer group reply (64-char group and account ids,
// 13-digit post id, 4000-char text, 80-char warning, 64-char place and channel,
// 128-char audience, 4 videos at the 200MB / 7680×4320 composer caps):
//   with 4×128-char stills: 6036 bytes (over the 6000 allowance)
//   without stills:         5476 bytes
// Realistic CIDv1 (59-char) stills on that reply: 5760 with a max audience,
// 5615 without. A personal max post with 128-char stills: 5681.
//
// Budget 5700 sits under the allowance (300 bytes of headroom) and between
// the stripped max (5476) and the stills that would blow it (6036).

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
