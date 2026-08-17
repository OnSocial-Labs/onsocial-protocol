import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { base64ToBytes, bytesToBase64, hashNep413Payload } from '@/lib/app-nep413';

/** Mirror of gateway serializeNep413Payload for a golden digest. */
function nodeNep413Digest(input: {
  message: string;
  nonce: Uint8Array;
  recipient: string;
}): Buffer {
  const encodeU32 = (value: number) => {
    const buf = Buffer.alloc(4);
    buf.writeUInt32LE(value, 0);
    return buf;
  };
  const encodeString = (value: string) => {
    const bytes = Buffer.from(value, 'utf8');
    return Buffer.concat([encodeU32(bytes.length), bytes]);
  };
  const prefix = encodeU32(2 ** 31 + 413);
  const payload = Buffer.concat([
    encodeString(input.message),
    Buffer.from(input.nonce),
    encodeString(input.recipient),
    Buffer.from([0]),
  ]);
  return createHash('sha256').update(Buffer.concat([prefix, payload])).digest();
}

describe('app-nep413', () => {
  it('round-trips base64 helpers', () => {
    const bytes = new Uint8Array([1, 2, 3, 250]);
    expect(base64ToBytes(bytesToBase64(bytes))).toEqual(bytes);
  });

  it('matches gateway NEP-413 SHA-256 digest', async () => {
    const nonce = new Uint8Array(32).fill(7);
    const input = {
      message:
        'OnSocial API Auth\nAccount: alice.testnet\nNonce: x\nIssued: 2026-01-01T00:00:00.000Z\nExpires: 2026-01-01T00:05:00.000Z\nNetwork: testnet',
      nonce,
      recipient: 'OnSocial Gateway',
    };
    const digest = await hashNep413Payload(input);
    expect(Buffer.from(digest).equals(nodeNep413Digest(input))).toBe(true);
  });
});
