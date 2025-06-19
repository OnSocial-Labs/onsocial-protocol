// src/utils.ts
import bs58 from 'bs58';
import * as base64js from 'base64-js';
import { sha256 } from 'js-sha256';

export function encodeBase58(data: Uint8Array): string {
  return bs58.encode(data);
}

export function decodeBase58(str: string): Uint8Array {
  return bs58.decode(str);
}

export function encodeBase64(data: Uint8Array): string {
  return base64js.fromByteArray(data);
}

export function decodeBase64(str: string): Uint8Array {
  return base64js.toByteArray(str);
}

// Hex encoding/decoding utilities
export function encodeHex(data: Uint8Array): string {
  return Array.from(data)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export function decodeHex(hex: string): Uint8Array {
  if (hex.length % 2 !== 0) throw new Error('Invalid hex string');
  const arr = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    arr[i / 2] = parseInt(hex.slice(i, i + 2), 16);
  }
  return arr;
}

// SHA256 hashing utility (browser/Expo compatible)
export function sha256Hash(data: Uint8Array): Uint8Array {
  // js-sha256 returns a hex string, so decode to Uint8Array
  const hex = sha256(data);
  return decodeHex(hex);
}

// UTF-8 string <-> Uint8Array conversions
export function utf8ToBytes(str: string): Uint8Array {
  if (typeof TextEncoder !== 'undefined') {
    return new TextEncoder().encode(str);
  }
  // Fallback for environments without TextEncoder
  const utf8 = unescape(encodeURIComponent(str));
  const arr = new Uint8Array(utf8.length);
  for (let i = 0; i < utf8.length; ++i) arr[i] = utf8.charCodeAt(i);
  return arr;
}

export function bytesToUtf8(bytes: Uint8Array): string {
  if (typeof TextDecoder !== 'undefined') {
    return new TextDecoder().decode(bytes);
  }
  // Fallback for environments without TextDecoder
  let str = '';
  for (let i = 0; i < bytes.length; ++i) str += String.fromCharCode(bytes[i]);
  return decodeURIComponent(escape(str));
}

// Validation helpers
export function isValidBase58(str: string): boolean {
  try {
    bs58.decode(str);
    return true;
  } catch {
    return false;
  }
}

export function isValidBase64(str: string): boolean {
  try {
    base64js.toByteArray(str);
    return true;
  } catch {
    return false;
  }
}

export function isValidHex(str: string): boolean {
  return /^[0-9a-fA-F]+$/.test(str) && str.length % 2 === 0;
}

export function isValidNearAccountId(accountId: string): boolean {
  // NEAR account ID rules: 2-64 chars, lowercase, digits, -_., no double dots, no leading/trailing dot
  if (!accountId || accountId.length < 2 || accountId.length > 64) return false;
  if (!/^[a-z0-9_\-\.]+$/.test(accountId)) return false;
  if (/\.\./.test(accountId)) return false;
  if (accountId.startsWith('.') || accountId.endsWith('.')) return false;
  return true;
}

// Random bytes utility (browser/Expo compatible)
export function randomBytes(length: number): Uint8Array {
  const arr = new Uint8Array(length);
  if (
    typeof crypto !== 'undefined' &&
    typeof crypto.getRandomValues === 'function'
  ) {
    crypto.getRandomValues(arr);
    return arr;
  }
  throw new Error(
    'Secure random number generator is not available in this environment'
  );
}
