// tests/utils.test.ts
import { describe, it, expect } from 'vitest';
import {
  encodeBase58,
  decodeBase58,
  encodeBase64,
  decodeBase64,
  encodeHex,
  decodeHex,
  sha256Hash,
  utf8ToBytes,
  bytesToUtf8,
  isValidBase58,
  isValidBase64,
  isValidHex,
  isValidNearAccountId,
  randomBytes,
} from '../src/utils';

const sample = 'hello world';
const sampleBytes = utf8ToBytes(sample);

describe('utils', () => {
  it('base58 encode/decode', () => {
    const encoded = encodeBase58(sampleBytes);
    const decoded = decodeBase58(encoded);
    expect(decoded).toEqual(sampleBytes);
    expect(isValidBase58(encoded)).toBe(true);
  });

  it('base64 encode/decode', () => {
    const encoded = encodeBase64(sampleBytes);
    const decoded = decodeBase64(encoded);
    expect(decoded).toEqual(sampleBytes);
    expect(isValidBase64(encoded)).toBe(true);
  });

  it('hex encode/decode', () => {
    const encoded = encodeHex(sampleBytes);
    const decoded = decodeHex(encoded);
    expect(decoded).toEqual(sampleBytes);
    expect(isValidHex(encoded)).toBe(true);
  });

  it('sha256Hash', () => {
    const hash = sha256Hash(sampleBytes);
    expect(hash).toBeInstanceOf(Uint8Array);
    expect(hash.length).toBe(32);
  });

  it('utf8 conversions', () => {
    const bytes = utf8ToBytes(sample);
    const str = bytesToUtf8(bytes);
    expect(str).toBe(sample);
  });

  it('randomBytes', () => {
    const arr = randomBytes(16);
    expect(arr).toBeInstanceOf(Uint8Array);
    expect(arr.length).toBe(16);
    expect(arr).not.toEqual(randomBytes(16)); // Should be random
  });

  it('isValidNearAccountId', () => {
    expect(isValidNearAccountId('alice.near')).toBe(true);
    expect(isValidNearAccountId('a')).toBe(false);
    expect(isValidNearAccountId('UPPERCASE.near')).toBe(false);
    expect(isValidNearAccountId('double..dot.near')).toBe(false);
    expect(isValidNearAccountId('.startdot')).toBe(false);
    expect(isValidNearAccountId('enddot.')).toBe(false);
  });
});
