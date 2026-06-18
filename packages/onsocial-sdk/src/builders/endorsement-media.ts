// ---------------------------------------------------------------------------
// Endorsement media resolution (upload File/Blob → MediaRef on IPFS).
// ---------------------------------------------------------------------------

import type { MediaRef } from '../schema/v1.js';
import type { StorageProvider } from '../storage/provider.js';
import { isFileLike } from './post.js';
import type { EndorsementBuildInput } from './endorsement.js';

export const ENDORSEMENT_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function createEndorsementId(): string {
  if (
    typeof crypto !== 'undefined' &&
    typeof crypto.randomUUID === 'function'
  ) {
    return crypto.randomUUID();
  }
  const bytes = new Uint8Array(16);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(bytes);
  } else {
    for (let index = 0; index < bytes.length; index += 1) {
      bytes[index] = Math.floor(Math.random() * 256);
    }
  }
  bytes[6] = (bytes[6]! & 0x0f) | 0x40;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) =>
    byte.toString(16).padStart(2, '0')
  ).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function isMediaRef(value: unknown): value is MediaRef {
  return (
    !!value &&
    typeof value === 'object' &&
    typeof (value as MediaRef).cid === 'string' &&
    (value as MediaRef).cid.length > 0 &&
    typeof (value as MediaRef).mime === 'string' &&
    (value as MediaRef).mime.length > 0
  );
}

export type ResolveEndorsementBuildInputOptions = {
  /** Preserve id on edit; generates one when missing on create. */
  existingId?: string;
  isEdit?: boolean;
  /** Keep existing on-chain media when the edit payload omits `media`. */
  preserveMedia?: MediaRef;
};

/**
 * Upload endorsement media when `media` is a File/Blob; preserve MediaRef
 * when already materialised; omit media when `media` is null (clear).
 */
export async function resolveEndorsementBuildInput(
  input: EndorsementBuildInput,
  storage: StorageProvider,
  options: ResolveEndorsementBuildInputOptions = {}
): Promise<EndorsementBuildInput> {
  const {
    media: rawMedia,
    id: inputId,
    editedAt: inputEditedAt,
    ...rest
  } = input;
  const id = inputId ?? options.existingId ?? createEndorsementId();
  const now = rest.now ?? Date.now();

  let media: MediaRef | undefined;
  if (rawMedia === null) {
    media = undefined;
  } else if (isFileLike(rawMedia)) {
    const uploaded = await storage.upload(rawMedia);
    media = {
      cid: uploaded.cid,
      mime: uploaded.mime,
      size: uploaded.size,
    };
  } else if (isMediaRef(rawMedia)) {
    media = rawMedia;
  } else if (rawMedia === undefined && isMediaRef(options.preserveMedia)) {
    media = options.preserveMedia;
  }

  return {
    ...rest,
    now,
    id,
    ...(media ? { media } : rawMedia === null ? {} : {}),
    ...(options.isEdit || inputEditedAt !== undefined
      ? { editedAt: inputEditedAt ?? now }
      : {}),
  };
}
