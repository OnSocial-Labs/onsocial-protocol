// Poster CIDs stored on MediaRef.poster. CIDv0 (base58btc) or CIDv1
// (multibase base32 / base58btc / base16), bare or `ipfs://`, at most 128 chars.

export const POSTER_CID_MAX_CHARS = 128;

const BASE58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
const BASE32 = 'abcdefghijklmnopqrstuvwxyz234567';

function decodeBase32(input: string): Uint8Array | null {
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of input.toLowerCase()) {
    const idx = BASE32.indexOf(ch);
    if (idx < 0) return null;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      out.push((value >>> bits) & 0xff);
    }
  }
  if (bits > 0 && (value & ((1 << bits) - 1)) !== 0) return null;
  return Uint8Array.from(out);
}

function decodeBase58(input: string): Uint8Array | null {
  const bytes = [0];
  for (const ch of input) {
    const idx = BASE58.indexOf(ch);
    if (idx < 0) return null;
    let carry = idx;
    for (let i = 0; i < bytes.length; i++) {
      carry += bytes[i]! * 58;
      bytes[i] = carry & 0xff;
      carry >>= 8;
    }
    while (carry > 0) {
      bytes.push(carry & 0xff);
      carry >>= 8;
    }
  }
  for (const ch of input) {
    if (ch !== '1') break;
    bytes.push(0);
  }
  return Uint8Array.from(bytes.reverse());
}

function readVarint(
  bytes: Uint8Array,
  offset: number
): { value: number; offset: number } | null {
  let value = 0;
  let shift = 0;
  while (offset < bytes.length && shift <= 28) {
    const byte = bytes[offset]!;
    offset += 1;
    value += (byte & 0x7f) * 2 ** shift;
    if ((byte & 0x80) === 0) return { value, offset };
    shift += 7;
  }
  return null;
}

function isCidV1Bytes(bytes: Uint8Array): boolean {
  const version = readVarint(bytes, 0);
  if (!version || version.value !== 1) return false;
  const codec = readVarint(bytes, version.offset);
  if (!codec) return false;
  const code = readVarint(bytes, codec.offset);
  if (!code) return false;
  const length = readVarint(bytes, code.offset);
  if (!length || length.value < 0) return false;
  return length.offset + length.value === bytes.length;
}

function isCidV0(value: string): boolean {
  if (!/^Qm[1-9A-HJ-NP-Za-km-z]{44}$/.test(value)) return false;
  const bytes = decodeBase58(value);
  return (
    !!bytes && bytes.length === 34 && bytes[0] === 0x12 && bytes[1] === 0x20
  );
}

function isCidV1(value: string): boolean {
  const prefix = value[0];
  let bytes: Uint8Array | null = null;
  if (prefix === 'b' || prefix === 'B') {
    bytes = decodeBase32(value.slice(1));
  } else if (prefix === 'z') {
    bytes = decodeBase58(value.slice(1));
  } else if (prefix === 'f' || prefix === 'F') {
    const hex = value.slice(1);
    if (!/^[0-9a-fA-F]+$/.test(hex) || hex.length % 2 !== 0) return false;
    const pairs = hex.match(/../g);
    if (!pairs) return false;
    bytes = Uint8Array.from(pairs.map((h) => Number.parseInt(h, 16)));
  } else {
    return false;
  }
  return !!bytes && isCidV1Bytes(bytes);
}

export function isIpfsCid(value: string): boolean {
  return isCidV0(value) || isCidV1(value);
}

export type PosterCidRejection = 'length' | 'not-a-cid';

function hasNonAscii(raw: string): boolean {
  for (let i = 0; i < raw.length; i += 1) {
    if (raw.charCodeAt(i) > 127) return true;
  }
  return false;
}

/**
 * Why a poster string cannot be stored, or null when it is a bare CIDv0/v1
 * or `ipfs://` CID of at most 128 characters. Length is reported on its own
 * so a too-long CID is not treated as a generic non-CID.
 */
export function posterCidRejection(raw: string): PosterCidRejection | null {
  if (typeof raw !== 'string' || raw.length === 0) return 'not-a-cid';
  if (raw.length > POSTER_CID_MAX_CHARS) return 'length';
  if (raw !== raw.trim() || /\s/u.test(raw) || hasNonAscii(raw)) {
    return 'not-a-cid';
  }
  const bare = raw.startsWith('ipfs://') ? raw.slice('ipfs://'.length) : raw;
  if (!bare || bare.includes('/') || !isIpfsCid(bare)) return 'not-a-cid';
  return null;
}

/**
 * Bare CID to store, or null when `raw` is not a CIDv0/v1 (bare or `ipfs://`)
 * of at most 128 characters. Whitespace and non-ASCII are rejected, not trimmed.
 */
export function acceptedPosterCid(raw: string): string | null {
  if (posterCidRejection(raw) !== null) return null;
  return raw.startsWith('ipfs://') ? raw.slice('ipfs://'.length) : raw;
}
