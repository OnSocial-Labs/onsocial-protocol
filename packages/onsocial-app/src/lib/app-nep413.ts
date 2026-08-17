/**
 * NEP-413 payload hash — must match gateway `serializeNep413Payload`.
 * Used to sign OnAPI auth challenges with the local social session key.
 */

function encodeU32(value: number): Uint8Array {
  const buffer = new ArrayBuffer(4);
  new DataView(buffer).setUint32(0, value, true);
  return new Uint8Array(buffer);
}

function encodeString(value: string): Uint8Array {
  const bytes = new TextEncoder().encode(value);
  const len = encodeU32(bytes.length);
  const out = new Uint8Array(len.length + bytes.length);
  out.set(len);
  out.set(bytes, len.length);
  return out;
}

function encodeOptionalString(value: string | null): Uint8Array {
  if (value == null) return new Uint8Array([0]);
  const encoded = encodeString(value);
  const out = new Uint8Array(1 + encoded.length);
  out[0] = 1;
  out.set(encoded, 1);
  return out;
}

function concatBytes(parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

export async function hashNep413Payload(input: {
  message: string;
  nonce: Uint8Array;
  recipient: string;
  callbackUrl?: string | null;
}): Promise<Uint8Array> {
  const prefix = encodeU32(2 ** 31 + 413);
  const payload = concatBytes([
    encodeString(input.message),
    input.nonce,
    encodeString(input.recipient),
    encodeOptionalString(input.callbackUrl ?? null),
  ]);
  // Copy into a fresh ArrayBuffer-backed view for `BufferSource` typing.
  const bytes = concatBytes([prefix, payload]);
  const buf = new Uint8Array(bytes.byteLength);
  buf.set(bytes);
  const digest = await crypto.subtle.digest('SHA-256', buf);
  return new Uint8Array(digest);
}

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]!);
  }
  return btoa(binary);
}

export function base64ToBytes(value: string): Uint8Array {
  return Uint8Array.from(atob(value), (char) => char.charCodeAt(0));
}
