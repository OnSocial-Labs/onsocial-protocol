// Round-trip coverage for `SignedDelegateAction` encoding.

import { describe, it, expect } from 'vitest';
import {
  buildSignedDelegate,
  parseEd25519PublicKey,
  type DelegateInnerAction,
} from './nep366.js';
import { generateEd25519Key } from './bootstrap.js';

type Bytes = Uint8Array<ArrayBuffer>;

function copyBytes(bytes: Uint8Array): Bytes {
  const out = new Uint8Array(bytes.length);
  out.set(bytes);
  return out;
}

class Cursor {
  off = 0;
  constructor(public readonly buf: Uint8Array) {}
  read(n: number): Bytes {
    if (this.off + n > this.buf.length) throw new Error('short read');
    const out = copyBytes(this.buf.subarray(this.off, this.off + n));
    this.off += n;
    return out;
  }
  u8(): number {
    return this.read(1)[0];
  }
  u32le(): number {
    const b = this.read(4);
    return new DataView(b.buffer, b.byteOffset, 4).getUint32(0, true);
  }
  u64le(): bigint {
    const b = this.read(8);
    return new DataView(b.buffer, b.byteOffset, 8).getBigUint64(0, true);
  }
  u128le(): bigint {
    const lo = this.u64le();
    const hi = this.u64le();
    return (hi << 64n) | lo;
  }
  string(): string {
    const len = this.u32le();
    return new TextDecoder().decode(this.read(len));
  }
  bytes(): Bytes {
    const len = this.u32le();
    return this.read(len);
  }
  pubKey(): Bytes {
    const t = this.u8();
    if (t !== 0) throw new Error(`unsupported public key variant ${t}`);
    return this.read(32);
  }
  done(): boolean {
    return this.off === this.buf.length;
  }
}

interface DecodedFunctionCallAction {
  type: 'FunctionCall';
  methodName: string;
  args: Bytes;
  gas: bigint;
  deposit: bigint;
}

interface DecodedTransferAction {
  type: 'Transfer';
  deposit: bigint;
}

type DecodedAccessKeyPermission =
  | 'FullAccess'
  | {
      allowance: bigint | null;
      receiverId: string;
      methodNames: string[];
    };

interface DecodedAddKeyAction {
  type: 'AddKey';
  publicKey: Bytes;
  accessKey: {
    nonce: bigint;
    permission: DecodedAccessKeyPermission;
  };
}

interface DecodedDeleteKeyAction {
  type: 'DeleteKey';
  publicKey: Bytes;
}

type DecodedAction =
  | DecodedFunctionCallAction
  | DecodedTransferAction
  | DecodedAddKeyAction
  | DecodedDeleteKeyAction;

interface DecodedDelegate {
  senderId: string;
  receiverId: string;
  actions: DecodedAction[];
  nonce: bigint;
  maxBlockHeight: bigint;
  publicKey: Bytes;
}

function hasActionType<T extends DecodedAction['type']>(
  action: DecodedAction,
  type: T
): action is Extract<DecodedAction, { type: T }> {
  return action.type === type;
}

function expectActionType<T extends DecodedAction['type']>(
  action: DecodedAction | undefined,
  type: T
): Extract<DecodedAction, { type: T }> {
  expect(action?.type).toBe(type);
  if (!action || !hasActionType(action, type)) {
    throw new Error(`expected ${type} action`);
  }
  return action;
}

function hasFunctionCallPermission(
  permission: DecodedAccessKeyPermission
): permission is Exclude<DecodedAccessKeyPermission, 'FullAccess'> {
  return permission !== 'FullAccess';
}

function expectFunctionCallPermission(
  action: DecodedAddKeyAction
): Exclude<DecodedAccessKeyPermission, 'FullAccess'> {
  expect(action.accessKey.permission).not.toBe('FullAccess');
  if (!hasFunctionCallPermission(action.accessKey.permission)) {
    throw new Error('expected function-call access key permission');
  }
  return action.accessKey.permission;
}

function decodeAction(c: Cursor): DecodedAction {
  const disc = c.u8();
  switch (disc) {
    case 2: {
      const methodName = c.string();
      const args = c.bytes();
      const gas = c.u64le();
      const deposit = c.u128le();
      return { type: 'FunctionCall', methodName, args, gas, deposit };
    }
    case 3:
      return { type: 'Transfer', deposit: c.u128le() };
    case 5: {
      const pk = c.pubKey();
      const nonce = c.u64le();
      const permTag = c.u8();
      if (permTag === 1) {
        return {
          type: 'AddKey',
          publicKey: pk,
          accessKey: { nonce, permission: 'FullAccess' },
        };
      }
      if (permTag !== 0) throw new Error(`bad perm tag ${permTag}`);
      const optTag = c.u8();
      const allowance = optTag === 1 ? c.u128le() : null;
      const receiverId = c.string();
      const methodCount = c.u32le();
      const methods: string[] = [];
      for (let i = 0; i < methodCount; i++) methods.push(c.string());
      return {
        type: 'AddKey',
        publicKey: pk,
        accessKey: {
          nonce,
          permission: { allowance, receiverId, methodNames: methods },
        },
      };
    }
    case 6:
      return { type: 'DeleteKey', publicKey: c.pubKey() };
    default:
      throw new Error(`unknown action discriminant ${disc}`);
  }
}

function decodeSignedDelegate(buf: Uint8Array): {
  delegate: DecodedDelegate;
  delegateBytes: Bytes;
  signature: Bytes;
} {
  const c = new Cursor(buf);
  const senderStart = c.off;
  const senderId = c.string();
  const receiverId = c.string();
  const actionCount = c.u32le();
  const actions: DecodedAction[] = [];
  for (let i = 0; i < actionCount; i++) actions.push(decodeAction(c));
  const nonce = c.u64le();
  const maxBlockHeight = c.u64le();
  const publicKey = c.pubKey();
  const delegateBytes = copyBytes(buf.subarray(senderStart, c.off));
  const sigTag = c.u8();
  if (sigTag !== 0) throw new Error(`unsupported signature variant ${sigTag}`);
  const signature = c.read(64);
  if (!c.done()) throw new Error(`trailing bytes: ${buf.length - c.off}`);
  return {
    delegate: {
      senderId,
      receiverId,
      actions,
      nonce,
      maxBlockHeight,
      publicKey,
    },
    delegateBytes,
    signature,
  };
}

function concat(...parts: Uint8Array[]): Bytes {
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const p of parts) {
    out.set(p, off);
    off += p.length;
  }
  return out;
}

const hasEd25519 = await (async () => {
  const subtle = (globalThis as { crypto?: { subtle?: SubtleCrypto } }).crypto
    ?.subtle;
  if (!subtle) return false;
  try {
    await subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify']);
    return true;
  } catch {
    return false;
  }
})();

describe.skipIf(!hasEd25519)(
  'NEP-366 round-trip (encode → decode → verify)',
  () => {
    it('round-trips senderId, receiverId, nonce, maxBlockHeight, publicKey', async () => {
      const key = await generateEd25519Key();
      const { bytes } = await buildSignedDelegate({
        senderId: 'alice.testnet',
        receiverId: 'core-onsocial.testnet',
        actions: [],
        nonce: 42n,
        maxBlockHeight: 999_999_999n,
        sessionPublicKey: key.publicKey,
        sign: key.sign,
      });
      const { delegate } = decodeSignedDelegate(bytes);
      expect(delegate.senderId).toBe('alice.testnet');
      expect(delegate.receiverId).toBe('core-onsocial.testnet');
      expect(delegate.actions).toEqual([]);
      expect(delegate.nonce).toBe(42n);
      expect(delegate.maxBlockHeight).toBe(999_999_999n);
      expect(delegate.publicKey).toEqual(parseEd25519PublicKey(key.publicKey));
    });

    it('round-trips a FunctionCall inner action', async () => {
      const key = await generateEd25519Key();
      const argsObj = {
        request: { action: { type: 'profile', data: { name: 'a' } } },
      };
      const argsBytes = new TextEncoder().encode(JSON.stringify(argsObj));
      const action: DelegateInnerAction = {
        type: 'FunctionCall',
        methodName: 'execute',
        args: argsBytes,
        gas: 100_000_000_000_000n,
        deposit: 0n,
      };
      const { bytes } = await buildSignedDelegate({
        senderId: 'alice.testnet',
        receiverId: 'core-onsocial.testnet',
        actions: [action],
        nonce: 1n,
        maxBlockHeight: 100n,
        sessionPublicKey: key.publicKey,
        sign: key.sign,
      });
      const { delegate } = decodeSignedDelegate(bytes);
      expect(delegate.actions).toHaveLength(1);
      const fc = expectActionType(delegate.actions[0], 'FunctionCall');
      expect(fc.type).toBe('FunctionCall');
      expect(fc.methodName).toBe('execute');
      expect(fc.gas).toBe(100_000_000_000_000n);
      expect(fc.deposit).toBe(0n);
      expect(JSON.parse(new TextDecoder().decode(fc.args))).toEqual(argsObj);
    });

    it('round-trips Transfer + AddKey + DeleteKey in one delegate', async () => {
      const key = await generateEd25519Key();
      const fcKey = await generateEd25519Key();
      const actions: DelegateInnerAction[] = [
        { type: 'Transfer', deposit: 1_000_000_000_000_000_000_000_000n },
        {
          type: 'AddKey',
          publicKey: fcKey.publicKey,
          accessKey: {
            nonce: 0n,
            permission: {
              type: 'FunctionCall',
              allowance: '250000000000000000000000',
              receiverId: 'core-onsocial.testnet',
              methodNames: ['execute'],
            },
          },
        },
        { type: 'DeleteKey', publicKey: fcKey.publicKey },
      ];
      const { bytes } = await buildSignedDelegate({
        senderId: 'alice.testnet',
        receiverId: 'alice.testnet',
        actions,
        nonce: 7n,
        maxBlockHeight: 200n,
        sessionPublicKey: key.publicKey,
        sign: key.sign,
      });
      const { delegate } = decodeSignedDelegate(bytes);
      expect(delegate.actions.map((a) => a.type)).toEqual([
        'Transfer',
        'AddKey',
        'DeleteKey',
      ]);
      const xfer = expectActionType(delegate.actions[0], 'Transfer');
      expect(xfer.deposit).toBe(1_000_000_000_000_000_000_000_000n);
      const add = expectActionType(delegate.actions[1], 'AddKey');
      const permission = expectFunctionCallPermission(add);
      expect(add.publicKey).toEqual(parseEd25519PublicKey(fcKey.publicKey));
      expect(permission.allowance).toBe(250_000_000_000_000_000_000_000n);
      expect(permission.receiverId).toBe('core-onsocial.testnet');
      expect(permission.methodNames).toEqual(['execute']);
    });

    it('signature verifies against NEP-461 hash with WebCrypto Ed25519', async () => {
      const key = await generateEd25519Key();
      const action: DelegateInnerAction = {
        type: 'FunctionCall',
        methodName: 'execute',
        args: new TextEncoder().encode('{}'),
        gas: 100_000_000_000_000n,
        deposit: 0n,
      };
      const { bytes } = await buildSignedDelegate({
        senderId: 'alice.testnet',
        receiverId: 'core-onsocial.testnet',
        actions: [action],
        nonce: 1n,
        maxBlockHeight: 100n,
        sessionPublicKey: key.publicKey,
        sign: key.sign,
      });
      const { delegate, delegateBytes, signature } =
        decodeSignedDelegate(bytes);

      // Reconstruct NEP-461 signable bytes: u32_le(discriminant) ++ delegateBytes
      const ON_CHAIN_NEP_366 = (1 << 30) + 366;
      const disc = new Uint8Array(4);
      new DataView(disc.buffer).setUint32(0, ON_CHAIN_NEP_366, true);
      const signable = concat(disc, delegateBytes);
      const hash = new Uint8Array(
        await crypto.subtle.digest('SHA-256', signable)
      );

      // Import the public key for verification
      const pubKey = await crypto.subtle.importKey(
        'raw',
        delegate.publicKey,
        { name: 'Ed25519' },
        false,
        ['verify']
      );
      const ok = await crypto.subtle.verify(
        { name: 'Ed25519' },
        pubKey,
        signature,
        hash
      );
      expect(ok).toBe(true);
    });
  }
);
