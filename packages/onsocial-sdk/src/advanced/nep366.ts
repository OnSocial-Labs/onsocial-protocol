// Minimal NEP-366 SignedDelegateAction encoder.

import type { SignerFn } from './session-key.js';

export type DelegateInnerAction =
  | {
      type: 'FunctionCall';
      methodName: string;
      args: Uint8Array | string; // string is JSON-stringified; we encode utf8
      gas: bigint | string; // yoctoGas (u64)
      deposit: bigint | string; // yoctoNEAR (u128)
    }
  | {
      type: 'Transfer';
      deposit: bigint | string;
    }
  | {
      type: 'AddKey';
      publicKey: string; // ed25519:<base58>
      accessKey: AccessKey;
    }
  | {
      type: 'DeleteKey';
      publicKey: string; // ed25519:<base58>
    };

export interface AccessKey {
  nonce?: bigint | string;
  permission:
    | { type: 'FullAccess' }
    | {
        type: 'FunctionCall';
        allowance: bigint | string | null;
        receiverId: string;
        methodNames: string[];
      };
}

export interface BuildSignedDelegateInput {
  senderId: string;
  receiverId: string;
  actions: DelegateInnerAction[];
  nonce: bigint | string;
  maxBlockHeight: bigint | string;
  sessionPublicKey: string;
  sign: SignerFn;
}

export interface BuildSignedDelegateResult {
  base64: string;
  bytes: Uint8Array;
}

/** Borsh-encodes and signs a `SignedDelegateAction`. */
export async function buildSignedDelegate(
  input: BuildSignedDelegateInput
): Promise<BuildSignedDelegateResult> {
  const pubKeyBytes = parseEd25519PublicKey(input.sessionPublicKey);

  const delegateBytes = encodeDelegateAction({
    senderId: input.senderId,
    receiverId: input.receiverId,
    actions: input.actions,
    nonce: BigInt(input.nonce),
    maxBlockHeight: BigInt(input.maxBlockHeight),
    publicKeyBytes: pubKeyBytes,
  });

  const ON_CHAIN_NEP_366 = (1 << 30) + 366; // 0x40000000 + 366
  const signable = concat(u32le(ON_CHAIN_NEP_366), delegateBytes);

  const hash = await sha256(signable);
  const signature = await input.sign(hash);
  if (!(signature instanceof Uint8Array) || signature.length !== 64) {
    throw new Error(
      `delegate signer must return 64 bytes (got ${signature?.length ?? 'unknown'})`
    );
  }

  const signedBytes = concat(
    delegateBytes,
    new Uint8Array([0x00]), // Signature enum variant: 0 = ED25519
    signature
  );

  return { base64: bytesToBase64(signedBytes), bytes: signedBytes };
}

function u8(n: number): Uint8Array {
  return new Uint8Array([n & 0xff]);
}

function u32le(n: number): Uint8Array {
  const out = new Uint8Array(4);
  new DataView(out.buffer).setUint32(0, n >>> 0, true);
  return out;
}

function u64le(n: bigint): Uint8Array {
  if (n < 0n) throw new RangeError('u64 cannot be negative');
  const out = new Uint8Array(8);
  new DataView(out.buffer).setBigUint64(0, n, true);
  return out;
}

function u128le(n: bigint): Uint8Array {
  if (n < 0n) throw new RangeError('u128 cannot be negative');
  const out = new Uint8Array(16);
  const lo = n & 0xffffffffffffffffn;
  const hi = n >> 64n;
  const view = new DataView(out.buffer);
  view.setBigUint64(0, lo, true);
  view.setBigUint64(8, hi, true);
  return out;
}

function borshString(s: string): Uint8Array {
  const bytes = new TextEncoder().encode(s);
  return concat(u32le(bytes.length), bytes);
}

function borshBytes(b: Uint8Array): Uint8Array {
  return concat(u32le(b.length), b);
}

function borshOption<T>(
  value: T | null | undefined,
  enc: (v: T) => Uint8Array
): Uint8Array {
  return value === null || value === undefined
    ? u8(0)
    : concat(u8(1), enc(value));
}

function borshVec<T>(items: T[], enc: (v: T) => Uint8Array): Uint8Array {
  return concat(u32le(items.length), ...items.map(enc));
}

function concat(...parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const p of parts) {
    out.set(p, off);
    off += p.length;
  }
  return out;
}

function encodeEd25519PublicKey(raw32: Uint8Array): Uint8Array {
  if (raw32.length !== 32) {
    throw new Error(`ED25519 public key must be 32 bytes, got ${raw32.length}`);
  }
  return concat(u8(0x00), raw32);
}

interface InternalDelegate {
  senderId: string;
  receiverId: string;
  actions: DelegateInnerAction[];
  nonce: bigint;
  maxBlockHeight: bigint;
  publicKeyBytes: Uint8Array;
}

function encodeDelegateAction(d: InternalDelegate): Uint8Array {
  return concat(
    borshString(d.senderId),
    borshString(d.receiverId),
    borshVec(d.actions, encodeAction),
    u64le(d.nonce),
    u64le(d.maxBlockHeight),
    encodeEd25519PublicKey(d.publicKeyBytes)
  );
}

function encodeAction(a: DelegateInnerAction): Uint8Array {
  switch (a.type) {
    case 'FunctionCall': {
      const args =
        typeof a.args === 'string' ? new TextEncoder().encode(a.args) : a.args;
      return concat(
        u8(2),
        borshString(a.methodName),
        borshBytes(args),
        u64le(BigInt(a.gas)),
        u128le(BigInt(a.deposit))
      );
    }
    case 'Transfer': {
      return concat(u8(3), u128le(BigInt(a.deposit)));
    }
    case 'AddKey': {
      const pk = parseEd25519PublicKey(a.publicKey);
      return concat(
        u8(5),
        encodeEd25519PublicKey(pk),
        encodeAccessKey(a.accessKey)
      );
    }
    case 'DeleteKey': {
      const pk = parseEd25519PublicKey(a.publicKey);
      return concat(u8(6), encodeEd25519PublicKey(pk));
    }
  }
}

function encodeAccessKey(k: AccessKey): Uint8Array {
  const nonce = u64le(BigInt(k.nonce ?? 0));
  if (k.permission.type === 'FullAccess') {
    return concat(nonce, u8(1));
  }
  const p = k.permission;
  return concat(
    nonce,
    u8(0),
    borshOption(
      p.allowance === null || p.allowance === undefined
        ? null
        : BigInt(p.allowance),
      (v) => u128le(v)
    ),
    borshString(p.receiverId),
    borshVec(p.methodNames, borshString)
  );
}

/** Parses `ed25519:<base58>` into raw 32-byte key bytes. */
export function parseEd25519PublicKey(key: string): Uint8Array {
  const idx = key.indexOf(':');
  if (idx < 0) {
    throw new Error(
      `Public key missing curve prefix (expected "ed25519:<base58>"): ${key}`
    );
  }
  const curve = key.slice(0, idx);
  if (curve !== 'ed25519') {
    throw new Error(
      `Only ed25519 keys supported in delegates (got "${curve}")`
    );
  }
  const decoded = base58Decode(key.slice(idx + 1));
  if (decoded.length !== 32) {
    throw new Error(
      `ed25519 key must decode to 32 bytes, got ${decoded.length}`
    );
  }
  return decoded;
}

const BASE58_ALPHABET =
  '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
const BASE58_MAP = (() => {
  const m = new Int8Array(128).fill(-1);
  for (let i = 0; i < BASE58_ALPHABET.length; i++) {
    m[BASE58_ALPHABET.charCodeAt(i)] = i;
  }
  return m;
})();

function base58Decode(s: string): Uint8Array {
  if (s.length === 0) return new Uint8Array(0);

  let zeros = 0;
  while (zeros < s.length && s[zeros] === '1') zeros++;

  const size = Math.ceil((s.length * 733) / 1000) + 1; // ~log256(58) bound
  const b256 = new Uint8Array(size);
  let length = 0;

  for (let i = zeros; i < s.length; i++) {
    const code = s.charCodeAt(i);
    let carry = code < 128 ? BASE58_MAP[code] : -1;
    if (carry < 0)
      throw new Error(`Invalid base58 char at index ${i}: "${s[i]}"`);
    let j = 0;
    for (let k = size - 1; (carry !== 0 || j < length) && k >= 0; k--, j++) {
      carry += 58 * b256[k];
      b256[k] = carry & 0xff;
      carry >>= 8;
    }
    if (carry !== 0) throw new Error('base58 overflow');
    length = j;
  }

  let start = size - length;
  while (start < size && b256[start] === 0) start++;
  const out = new Uint8Array(zeros + (size - start));
  out.set(b256.subarray(start), zeros);
  return out;
}

async function sha256(data: Uint8Array): Promise<Uint8Array> {
  if (
    typeof globalThis.crypto !== 'undefined' &&
    globalThis.crypto.subtle &&
    typeof globalThis.crypto.subtle.digest === 'function'
  ) {
    // Copy into a fresh view to satisfy `BufferSource` typing.
    const view = new Uint8Array(data.byteLength);
    view.set(data);
    const buf = await globalThis.crypto.subtle.digest('SHA-256', view);
    return new Uint8Array(buf);
  }
  const nodeCrypto = await import('node:crypto');
  return new Uint8Array(nodeCrypto.createHash('sha256').update(data).digest());
}

function bytesToBase64(bytes: Uint8Array): string {
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(bytes).toString('base64');
  }
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}
