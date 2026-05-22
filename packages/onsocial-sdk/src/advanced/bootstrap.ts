// Session bootstrap helpers.

import {
  Session,
  buildSessionGrant,
  buildSessionRevoke,
  type BuildSessionGrantInput,
  type OnboardingPlan,
  type SessionContract,
} from './session.js';
import { resolveContractId, type CoreAction } from './actions.js';
import type { Network } from '../types.js';
import type { SessionKey, SignerFn } from './session-key.js';

/** Wallet action shape used during bootstrap and revoke flows. */
export type NearAction =
  | {
      type: 'AddKey';
      params: {
        publicKey: string;
        accessKey: {
          nonce?: number;
          permission:
            | 'FullAccess'
            | {
                receiverId: string;
                methodNames: string[];
                allowance?: string;
              };
        };
      };
    }
  | {
      type: 'DeleteKey';
      params: { publicKey: string };
    }
  | {
      type: 'FunctionCall';
      params: {
        methodName: string;
        args: Record<string, unknown> | Uint8Array;
        gas: string;
        deposit: string;
      };
    }
  | {
      type: 'Transfer';
      params: { deposit: string };
    };

/** Minimal wallet surface needed by the bootstrap helpers. */
export interface WalletAdapter {
  accountId(): string | Promise<string>;
  signAndSendTransactions(opts: {
    transactions: Array<{ receiverId: string; actions: NearAction[] }>;
  }): Promise<unknown>;
}

export interface NearConnectWalletLike {
  signAndSendTransactions(params: {
    network?: Network;
    signerId?: string;
    transactions: Array<{ receiverId: string; actions: NearAction[] }>;
  }): Promise<unknown>;
  getAccounts?(data?: {
    network?: Network;
  }): Promise<Array<{ accountId: string }>>;
}

/** Wraps a wallet-selector-compatible wallet as a `WalletAdapter`. */
export function nearConnectAdapter(
  wallet: NearConnectWalletLike | null | undefined,
  accountId: string | null | undefined,
  options: { network?: Network } = {}
): WalletAdapter {
  if (!wallet) {
    throw new Error(
      'nearConnectAdapter: wallet is null — user is not signed in'
    );
  }

  const accountLookupArgs = options.network
    ? { network: options.network }
    : undefined;
  const transactionNetworkArgs = options.network
    ? { network: options.network }
    : {};

  const resolveAccountId = async (): Promise<string> => {
    const accounts = (await wallet.getAccounts?.(accountLookupArgs)) ?? [];

    if (accountId) {
      if (
        accounts.length > 0 &&
        !accounts.some((account) => account.accountId === accountId)
      ) {
        throw new Error(
          `nearConnectAdapter: wallet is not signed in as ${accountId}`
        );
      }

      return accountId;
    }

    const id = accounts[0]?.accountId;
    if (!id) {
      throw new Error('nearConnectAdapter: no signed-in accountId available');
    }
    return id;
  };

  return {
    accountId: resolveAccountId,
    signAndSendTransactions: async ({ transactions }) => {
      const signerId = await resolveAccountId();
      return wallet.signAndSendTransactions({
        ...transactionNetworkArgs,
        signerId,
        transactions,
      });
    },
  };
}

/** Serialized session metadata. */
export interface StoredSession {
  v: 2;
  accountId: string;
  contract: SessionContract;
  contractId: string;
  network: Network;
  publicKey: string;
  secretSeedB64u: string;
  path?: string;
  lastNonce: number;
  expiresAtMs?: number;
}

export interface KeyStore {
  get(id: string): Promise<StoredSession | null>;
  set(id: string, value: StoredSession): Promise<void>;
  delete(id: string): Promise<void>;
}

/** In-memory store. */
export class MemoryKeyStore implements KeyStore {
  private readonly map = new Map<string, StoredSession>();
  async get(id: string): Promise<StoredSession | null> {
    return this.map.get(id) ?? null;
  }
  async set(id: string, value: StoredSession): Promise<void> {
    this.map.set(id, structuredClone(value));
  }
  async delete(id: string): Promise<void> {
    this.map.delete(id);
  }
}

/** Browser `localStorage`-backed store. */
export function localStorageKeyStore(prefix = 'onsocial.session.'): KeyStore {
  const ls = (globalThis as { localStorage?: Storage }).localStorage;
  if (!ls) throw new Error('localStorage is not available in this environment');
  return {
    async get(id) {
      const raw = ls.getItem(prefix + id);
      if (!raw) return null;
      try {
        return JSON.parse(raw) as StoredSession;
      } catch {
        return null;
      }
    },
    async set(id, value) {
      ls.setItem(prefix + id, JSON.stringify(value));
    },
    async delete(id) {
      ls.removeItem(prefix + id);
    },
  };
}

export function sessionId(
  accountId: string,
  contract: SessionContract,
  path?: string
): string {
  return path ? `${accountId}|${contract}|${path}` : `${accountId}|${contract}`;
}

const BASE58_ALPHABET =
  '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

export function base58Encode(bytes: Uint8Array): string {
  if (bytes.length === 0) return '';
  let zeros = 0;
  while (zeros < bytes.length && bytes[zeros] === 0) zeros++;

  const size = Math.ceil((bytes.length * 138) / 100) + 1;
  const b58 = new Uint8Array(size);
  let length = 0;

  for (let i = zeros; i < bytes.length; i++) {
    let carry = bytes[i];
    let j = 0;
    for (let k = size - 1; (carry !== 0 || j < length) && k >= 0; k--, j++) {
      carry += 256 * b58[k];
      b58[k] = carry % 58;
      carry = Math.floor(carry / 58);
    }
    length = j;
  }

  let out = '';
  for (let i = 0; i < zeros; i++) out += '1';
  for (let i = size - length; i < size; i++) out += BASE58_ALPHABET[b58[i]];
  return out;
}

function base64UrlEncode(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlDecode(s: string): Uint8Array {
  const pad = s.length % 4 === 0 ? 0 : 4 - (s.length % 4);
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat(pad);
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

interface SubtleEd25519Key {
  type: 'public' | 'private' | 'secret';
}

interface SubtleLike {
  generateKey(
    algorithm: { name: string },
    extractable: boolean,
    usages: string[]
  ): Promise<{ publicKey: SubtleEd25519Key; privateKey: SubtleEd25519Key }>;
  exportKey(format: 'jwk', key: SubtleEd25519Key): Promise<JsonWebKey>;
  importKey(
    format: 'jwk',
    keyData: JsonWebKey,
    algorithm: { name: string },
    extractable: boolean,
    usages: string[]
  ): Promise<SubtleEd25519Key>;
  sign(
    algorithm: { name: string },
    key: SubtleEd25519Key,
    data: BufferSource
  ): Promise<ArrayBuffer>;
}

function subtle(): SubtleLike {
  const c = (globalThis as { crypto?: { subtle?: unknown } }).crypto;
  if (!c?.subtle) {
    throw new Error(
      'WebCrypto subtle is unavailable; pass a pre-built SessionKey to Session() instead'
    );
  }
  return c.subtle as SubtleLike;
}

export interface GeneratedSessionKey {
  publicKey: string;
  secretSeedB64u: string;
  sign: SignerFn;
}

/** Generates an Ed25519 session key via WebCrypto. */
export async function generateEd25519Key(): Promise<GeneratedSessionKey> {
  const s = subtle();
  const pair = await s.generateKey({ name: 'Ed25519' }, true, [
    'sign',
    'verify',
  ]);
  const pubJwk = await s.exportKey('jwk', pair.publicKey);
  const privJwk = await s.exportKey('jwk', pair.privateKey);
  if (!pubJwk.x || !privJwk.d) {
    throw new Error('WebCrypto Ed25519 export returned unexpected JWK shape');
  }
  const pubBytes = base64UrlDecode(pubJwk.x);
  if (pubBytes.length !== 32) {
    throw new Error(
      `expected 32-byte ed25519 public key, got ${pubBytes.length}`
    );
  }
  const publicKey = `ed25519:${base58Encode(pubBytes)}`;
  return {
    publicKey,
    secretSeedB64u: privJwk.d,
    sign: makeSigner(s, pair.privateKey),
  };
}

/** Restores a previously generated key from its seed. */
export async function restoreEd25519Key(
  secretSeedB64u: string,
  publicKey: string
): Promise<SessionKey> {
  const s = subtle();
  // Some runtimes require the public JWK `x` field on import.
  const idx = publicKey.indexOf(':');
  if (idx < 0) throw new Error(`invalid public key: ${publicKey}`);
  const pubB58 = publicKey.slice(idx + 1);
  const pubBytes = base58DecodeStrict(pubB58);
  if (pubBytes.length !== 32) {
    throw new Error(`invalid ed25519 public key length: ${pubBytes.length}`);
  }
  const jwk: JsonWebKey = {
    kty: 'OKP',
    crv: 'Ed25519',
    d: secretSeedB64u,
    x: base64UrlEncode(pubBytes),
  };
  const priv = await s.importKey('jwk', jwk, { name: 'Ed25519' }, true, [
    'sign',
  ]);
  return { publicKey, sign: makeSigner(s, priv) };
}

function makeSigner(s: SubtleLike, priv: SubtleEd25519Key): SignerFn {
  return async (msg: Uint8Array): Promise<Uint8Array> => {
    // Copy into a fresh view to satisfy `BufferSource` typing.
    const buf = new Uint8Array(msg.byteLength);
    buf.set(msg);
    const sig = await s.sign({ name: 'Ed25519' }, priv, buf);
    return new Uint8Array(sig);
  };
}

const BASE58_MAP = (() => {
  const m = new Int8Array(128).fill(-1);
  for (let i = 0; i < BASE58_ALPHABET.length; i++) {
    m[BASE58_ALPHABET.charCodeAt(i)] = i;
  }
  return m;
})();

function base58DecodeStrict(s: string): Uint8Array {
  if (s.length === 0) return new Uint8Array(0);
  let zeros = 0;
  while (zeros < s.length && s[zeros] === '1') zeros++;
  const size = Math.ceil((s.length * 733) / 1000) + 1;
  const b256 = new Uint8Array(size);
  let length = 0;
  for (let i = zeros; i < s.length; i++) {
    const code = s.charCodeAt(i);
    let carry = code < 128 ? BASE58_MAP[code] : -1;
    if (carry < 0)
      throw new Error(`invalid base58 char at index ${i}: "${s[i]}"`);
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

const DEFAULT_GRANT_GAS_TGAS = 100;

/** Expands an onboarding plan into wallet transactions. */
export function planToWalletTransactions(
  plan: OnboardingPlan,
  opts: { gasTgas?: number } = {}
): Array<{ receiverId: string; actions: NearAction[] }> {
  const gas = String(
    BigInt(opts.gasTgas ?? DEFAULT_GRANT_GAS_TGAS) * 1_000_000_000_000n
  );
  const txs: Array<{ receiverId: string; actions: NearAction[] }> = [
    {
      receiverId: plan.accountId,
      actions: [
        {
          type: 'AddKey',
          params: {
            publicKey: plan.publicKey,
            accessKey: {
              permission: {
                receiverId: plan.accessKey.receiverId,
                methodNames: plan.accessKey.methodNames,
                ...(plan.accessKey.allowanceYocto !== null && {
                  allowance: plan.accessKey.allowanceYocto,
                }),
              },
            },
          },
        },
      ],
    },
  ];

  if (plan.coreActions.length > 0) {
    txs.push({
      receiverId: plan.accessKey.receiverId,
      actions: plan.coreActions.map((action) =>
        coreExecuteAdminFunctionCall(
          action,
          gas,
          storageDepositForAction(action)
        )
      ),
    });
  }

  return txs;
}

function coreExecuteAdminFunctionCall(
  action: CoreAction,
  gas: string,
  deposit: string
): NearAction {
  return {
    type: 'FunctionCall',
    params: {
      // Session-key grants and reserved storage/* writes are admin-only on core.
      methodName: 'execute_admin',
      args: { request: { action } },
      gas,
      deposit,
    },
  };
}

function storageDepositForAction(action: CoreAction): string {
  let total = 0n;
  if (
    action.type === 'set' &&
    typeof action.data === 'object' &&
    action.data !== null
  ) {
    for (const [key, value] of Object.entries(
      action.data as Record<string, unknown>
    )) {
      if (key !== 'storage/deposit') continue;
      const d = value;
      if (d && typeof d === 'object') {
        const amt = (d as { amount?: unknown }).amount;
        if (typeof amt === 'string') total += BigInt(amt);
      }
    }
  }
  return total.toString();
}

export interface BootstrapSessionInput
  extends Omit<BuildSessionGrantInput, 'sessionPublicKey' | 'accountId'> {
  /** Wallet adapter to drive the one-popup grant. */
  wallet: WalletAdapter;
  /** Optional override; defaults to `wallet.accountId()`. */
  accountId?: string;
  /** Persistence; defaults to in-memory (lost on reload). */
  store?: KeyStore;
  /** TGas attached to the bootstrap `execute_admin` FunctionCall. Default 100. */
  grantGasTgas?: number;
  /** First delegate nonce for the new session key. Defaults to `Date.now()`. */
  startingNonce?: number;
}

/** Generates, grants, persists, and returns a session. */
export async function bootstrapSession(
  input: BootstrapSessionInput
): Promise<Session> {
  const accountId = input.accountId ?? (await input.wallet.accountId());
  const generated = await generateEd25519Key();

  const plan = buildSessionGrant({
    network: input.network,
    accountId,
    sessionPublicKey: generated.publicKey,
    contract: input.contract,
    contractId: input.contractId,
    functionCallKey: input.functionCallKey,
    path: input.path,
    ttlMs: input.ttlMs,
    storageDepositYocto: input.storageDepositYocto,
    level: input.level,
    now: input.now,
  });

  const transactions = planToWalletTransactions(plan, {
    gasTgas: input.grantGasTgas,
  });
  await input.wallet.signAndSendTransactions({ transactions });

  const contractId =
    input.contractId ?? resolveContractId(input.network, input.contract);
  if (!contractId) {
    throw new Error(`unknown contract ${input.contract}`);
  }

  const initialNonce = Math.max(
    1,
    Math.floor(input.startingNonce ?? Date.now())
  );

  const stored: StoredSession = {
    v: 2,
    accountId,
    contract: input.contract,
    contractId,
    network: input.network,
    publicKey: generated.publicKey,
    secretSeedB64u: generated.secretSeedB64u,
    path: input.path,
    lastNonce: initialNonce - 1,
    expiresAtMs: plan.expiresAtMs,
  };
  if (input.store) {
    await input.store.set(
      sessionId(accountId, input.contract, input.path),
      stored
    );
  }

  return new Session({
    network: input.network,
    accountId,
    contract: input.contract,
    contractId: input.contractId,
    key: { publicKey: generated.publicKey, sign: generated.sign },
    startingNonce: initialNonce,
    remainingAllowanceYocto: input.functionCallKey.allowanceYocto,
  });
}

export interface RestoreSessionInput {
  store: KeyStore;
  accountId: string;
  contract: SessionContract;
  path?: string;
  startingNonce?: number;
  remainingAllowanceYocto?: string | null;
}

/** Restores a session from persisted state. */
export async function restoreSession(
  input: RestoreSessionInput
): Promise<Session | null> {
  const id = sessionId(input.accountId, input.contract, input.path);
  const stored = await input.store.get(id);
  if (!stored) return null;
  if (stored.expiresAtMs && stored.expiresAtMs < Date.now()) {
    await input.store.delete(id);
    return null;
  }
  const key = await restoreEd25519Key(stored.secretSeedB64u, stored.publicKey);
  return new Session({
    network: stored.network,
    accountId: stored.accountId,
    contract: stored.contract,
    contractId: stored.contractId,
    key,
    startingNonce:
      input.startingNonce ?? Math.max(stored.lastNonce + 1, Date.now()),
    remainingAllowanceYocto: input.remainingAllowanceYocto,
  });
}

export interface RevokeSessionInput {
  wallet: WalletAdapter;
  publicKey: string;
  contract: SessionContract;
  path?: string;
  network: Network;
  contractId?: string;
  store?: KeyStore;
  accountId?: string;
  gasTgas?: number;
}

/** Revokes a session key and clears any stored metadata. */
export async function revokeSession(input: RevokeSessionInput): Promise<void> {
  const accountId = input.accountId ?? (await input.wallet.accountId());
  const { coreActions } = buildSessionRevoke({
    publicKey: input.publicKey,
    contract: input.contract,
    path: input.path,
  });

  const txs: Array<{ receiverId: string; actions: NearAction[] }> = [
    {
      receiverId: accountId,
      actions: [{ type: 'DeleteKey', params: { publicKey: input.publicKey } }],
    },
  ];
  if (coreActions.length > 0) {
    const contractId =
      input.contractId ?? resolveContractId(input.network, input.contract);
    if (!contractId) throw new Error(`unknown contract ${input.contract}`);
    const gas = String(
      BigInt(input.gasTgas ?? DEFAULT_GRANT_GAS_TGAS) * 1_000_000_000_000n
    );
    txs.push({
      receiverId: contractId,
      actions: coreActions.map((action) =>
        coreExecuteAdminFunctionCall(action, gas, '0')
      ),
    });
  }

  await input.wallet.signAndSendTransactions({ transactions: txs });

  if (input.store) {
    await input.store.delete(sessionId(accountId, input.contract, input.path));
  }
}
