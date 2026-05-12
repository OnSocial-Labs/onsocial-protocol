// Parity tests for the NEP-366 borsh encoder.

import { describe, it, expect } from 'vitest';
import {
  buildSignedDelegate,
  parseEd25519PublicKey,
  type DelegateInnerAction,
} from './nep366.js';

// A 32-byte all-zero ed25519 key, which `PublicKey::empty(KeyType::ED25519)`
// produces in near-crypto. base58("\x00" * 32) = "11111111111111111111111111111111"
const ED25519_ZERO = 'ed25519:11111111111111111111111111111111';

const ZERO_64 = new Uint8Array(64);
const NULL_SIGN = async () => ZERO_64;

function bytesToHex(b: Uint8Array): string {
  return Array.from(b)
    .map((x) => x.toString(16).padStart(2, '0'))
    .join('');
}

// Fixtures generated with `near-primitives` 0.30 (Rust borsh dump).
// Format: `borsh(SignedDelegateAction)` for each vector.
const RUST_FIXTURE_A_SIGNED =
  '0a000000616c6963652e6e65617212000000636f72652d6f6e736f6369616c2e6e6561720000000007000000000000004e61bc00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000';
const RUST_FIXTURE_B_SIGNED =
  '0a000000616c6963652e6e65617212000000636f72652d6f6e736f6369616c2e6e65617201000000020700000065786563757465110000007b2268656c6c6f223a22776f726c64227d00407a10f35a0000010000000000000000000000000000002a00000000000000e7030000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000';
const RUST_FIXTURE_C_DELEGATE =
  '0a000000616c6963652e6e6561720a000000616c6963652e6e6561720100000003000040683bb3f386f03400000000000001000000000000000100000000000000000000000000000000000000000000000000000000000000000000000000000000';
const RUST_FIXTURE_A_SIGNABLE =
  '6e0100400a000000616c6963652e6e65617212000000636f72652d6f6e736f6369616c2e6e6561720000000007000000000000004e61bc0000000000000000000000000000000000000000000000000000000000000000000000000000';

describe('nep366 borsh encoder — parity with near-primitives 0.30', () => {
  it('vector A: empty actions DelegateAction matches', async () => {
    const { bytes } = await buildSignedDelegate({
      senderId: 'alice.near',
      receiverId: 'core-onsocial.near',
      actions: [],
      nonce: 7n,
      maxBlockHeight: 12345678n,
      sessionPublicKey: ED25519_ZERO,
      sign: NULL_SIGN,
    });
    expect(bytesToHex(bytes)).toBe(RUST_FIXTURE_A_SIGNED);
  });

  it('vector B: FunctionCall action matches', async () => {
    const action: DelegateInnerAction = {
      type: 'FunctionCall',
      methodName: 'execute',
      args: '{"hello":"world"}',
      gas: 100_000_000_000_000n,
      deposit: 1n,
    };
    const { bytes } = await buildSignedDelegate({
      senderId: 'alice.near',
      receiverId: 'core-onsocial.near',
      actions: [action],
      nonce: 42n,
      maxBlockHeight: 999n,
      sessionPublicKey: ED25519_ZERO,
      sign: NULL_SIGN,
    });
    expect(bytesToHex(bytes)).toBe(RUST_FIXTURE_B_SIGNED);
  });

  it('vector C: Transfer action DelegateAction matches', async () => {
    const action: DelegateInnerAction = {
      type: 'Transfer',
      deposit: 250_000_000_000_000_000_000_000n,
    };
    const { bytes } = await buildSignedDelegate({
      senderId: 'alice.near',
      receiverId: 'alice.near',
      actions: [action],
      nonce: 1n,
      maxBlockHeight: 1n,
      sessionPublicKey: ED25519_ZERO,
      sign: NULL_SIGN,
    });
    // Strip trailing 65 bytes (1 enum + 64 sig)
    const delegateOnly = bytes.subarray(0, bytes.length - 65);
    expect(bytesToHex(delegateOnly)).toBe(RUST_FIXTURE_C_DELEGATE);
  });

  it('NEP-461 signable bytes are sha256(u32_le(disc) ++ borsh(delegate))', async () => {
    let captured: Uint8Array | undefined;
    const sign = async (msg: Uint8Array) => {
      captured = msg;
      return ZERO_64;
    };

    await buildSignedDelegate({
      senderId: 'alice.near',
      receiverId: 'core-onsocial.near',
      actions: [],
      nonce: 7n,
      maxBlockHeight: 12345678n,
      sessionPublicKey: ED25519_ZERO,
      sign,
    });

    expect(captured).toBeDefined();
    expect(captured!.length).toBe(32);

    const expectedBytes = new Uint8Array(
      RUST_FIXTURE_A_SIGNABLE.match(/.{2}/g)!.map((h) => parseInt(h, 16))
    );
    const expectedHash = new Uint8Array(
      await crypto.subtle.digest('SHA-256', expectedBytes)
    );
    expect(bytesToHex(captured!)).toBe(bytesToHex(expectedHash));
  });

  it('rejects non-ed25519 keys', () => {
    expect(() => parseEd25519PublicKey('secp256k1:abc')).toThrow(/ed25519/);
  });

  it('rejects keys without curve prefix', () => {
    expect(() =>
      parseEd25519PublicKey('11111111111111111111111111111111')
    ).toThrow(/curve prefix/);
  });

  it('rejects signatures that are not 64 bytes', async () => {
    await expect(
      buildSignedDelegate({
        senderId: 'alice.near',
        receiverId: 'core-onsocial.near',
        actions: [],
        nonce: 1n,
        maxBlockHeight: 1n,
        sessionPublicKey: ED25519_ZERO,
        sign: async () => new Uint8Array(32),
      })
    ).rejects.toThrow(/64 bytes/);
  });
});
