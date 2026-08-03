/**
 * On-chain collection IDs are globally unique on scarces-onsocial.
 * We derive a readable slug from the title, then append a short random
 * suffix so two creators can both drop "genesis-prints" without colliding.
 */

const SUFFIX_ALPHABET = '0123456789abcdefghijklmnopqrstuvwxyz';

/** Cryptographic short suffix — stable for the life of the create form. */
export function randomDropIdSuffix(length = 6): string {
  const bytes = new Uint8Array(length);
  globalThis.crypto.getRandomValues(bytes);
  let out = '';
  for (const byte of bytes) {
    out += SUFFIX_ALPHABET[byte % SUFFIX_ALPHABET.length];
  }
  return out;
}

export function buildCollectionId(slug: string, suffix: string): string {
  return `${slug}-${suffix}`;
}
