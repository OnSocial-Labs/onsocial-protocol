import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  bootstrapSession,
  base58Encode,
  generateEd25519Key,
  MemoryKeyStore,
  nearConnectAdapter,
  planToWalletTransactions,
  restoreSession,
  restoreEd25519Key,
  revokeSession,
  sessionId,
  type WalletAdapter,
} from './bootstrap.js';
import { buildSessionGrant } from './session.js';

// WebCrypto Ed25519 is supported in Node 20+. Skip the keygen tests if not
// available; the rest still cover plan->actions translation.
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

describe('base58Encode', () => {
  it('encodes empty input', () => {
    expect(base58Encode(new Uint8Array(0))).toBe('');
  });
  it('preserves leading zeros as "1"s', () => {
    expect(base58Encode(new Uint8Array([0, 0, 1]))).toBe('112');
  });
  it('round-trips a 32-byte ed25519 public key', () => {
    const bytes = new Uint8Array(32);
    for (let i = 0; i < 32; i++) bytes[i] = i + 1;
    const enc = base58Encode(bytes);
    // length should be ~44 chars, start with no leading '1'
    expect(enc.length).toBeGreaterThan(40);
    expect(enc.length).toBeLessThan(50);
  });
});

describe('planToWalletTransactions', () => {
  it('emits a single AddKey tx for non-core sessions', () => {
    const plan = buildSessionGrant({
      network: 'mainnet',
      accountId: 'alice.near',
      sessionPublicKey: 'ed25519:11111111111111111111111111111111',
      contract: 'scarces',
      functionCallKey: { allowanceYocto: '250000000000000000000000' },
    });
    const txs = planToWalletTransactions(plan);
    expect(txs).toHaveLength(1);
    expect(txs[0].receiverId).toBe('alice.near');
    expect(txs[0].actions).toHaveLength(1);
    expect(txs[0].actions[0].type).toBe('AddKey');
  });

  it('emits AddKey + valid execute_admin actions for core sessions', () => {
    const plan = buildSessionGrant({
      network: 'mainnet',
      accountId: 'alice.near',
      sessionPublicKey: 'ed25519:11111111111111111111111111111111',
      contract: 'core',
      path: 'apps/myapp/',
      storageDepositYocto: '5000000000000000000000', // 0.005 N
      functionCallKey: { allowanceYocto: '250000000000000000000000' },
      now: 1_700_000_000_000,
    });
    const txs = planToWalletTransactions(plan, { gasTgas: 100 });
    expect(txs).toHaveLength(2);
    expect(txs[0].actions[0].type).toBe('AddKey');
    expect(txs[1].receiverId).toBe(plan.accessKey.receiverId);
    expect(txs[1].actions).toHaveLength(2);

    const storage = txs[1].actions[0];
    expect(storage.type).toBe('FunctionCall');
    if (storage.type !== 'FunctionCall') throw new Error('unreachable');
    expect(storage.params.methodName).toBe('execute_admin');
    expect(storage.params.deposit).toBe('5000000000000000000000');
    expect(storage.params.gas).toBe('100000000000000');
    expect(storage.params.args).toEqual({
      request: {
        action: {
          type: 'set',
          data: {
            'storage/deposit': { amount: '5000000000000000000000' },
          },
        },
      },
    });

    const keyPermission = txs[1].actions[1];
    expect(keyPermission.type).toBe('FunctionCall');
    if (keyPermission.type !== 'FunctionCall') throw new Error('unreachable');
    expect(keyPermission.params.methodName).toBe('execute_admin');
    expect(keyPermission.params.deposit).toBe('0');
    expect(keyPermission.params.args).toEqual({
      request: {
        action: {
          type: 'set_key_permission',
          public_key: 'ed25519:11111111111111111111111111111111',
          path: 'apps/myapp/',
          level: 1,
          expires_at: '1700086400000',
        },
      },
    });
  });

  it('can omit AddKey when the key was already added at wallet sign-in', () => {
    const plan = buildSessionGrant({
      network: 'mainnet',
      accountId: 'alice.near',
      sessionPublicKey: 'ed25519:11111111111111111111111111111111',
      contract: 'core',
      path: 'alice.near/',
      functionCallKey: { allowanceYocto: '250000000000000000000000' },
    });
    const txs = planToWalletTransactions(plan, { includeAddKey: false });
    expect(txs).toHaveLength(1);
    expect(txs[0].actions.every((action) => action.type !== 'AddKey')).toBe(
      true
    );
  });
});

describe('MemoryKeyStore', () => {
  it('round-trips a stored session', async () => {
    const store = new MemoryKeyStore();
    const data = {
      v: 2 as const,
      accountId: 'alice.near',
      contract: 'core' as const,
      contractId: 'core.onsocial.near',
      network: 'mainnet' as const,
      publicKey: 'ed25519:abc',
      secretSeedB64u: 'AAAA',
      lastNonce: 5,
    };
    await store.set('id', data);
    expect(await store.get('id')).toEqual(data);
    await store.delete('id');
    expect(await store.get('id')).toBeNull();
  });
});

describe('sessionId', () => {
  it('includes path when present', () => {
    expect(sessionId('alice.near', 'core', 'apps/x/')).toBe(
      'alice.near|core|apps/x/'
    );
    expect(sessionId('alice.near', 'scarces')).toBe('alice.near|scarces');
  });
});

describe('nearConnectAdapter', () => {
  it('forwards transactions and uses the explicit accountId', async () => {
    const wallet = {
      signAndSendTransactions: vi.fn(async () => 'ok'),
      getAccounts: vi.fn(async () => [{ accountId: 'alice.near' }]),
    };
    const adapter = nearConnectAdapter(wallet, 'alice.near', {
      network: 'testnet',
    });
    expect(await adapter.accountId()).toBe('alice.near');
    expect(wallet.getAccounts).not.toHaveBeenCalled();

    const txs = { transactions: [{ receiverId: 'x.near', actions: [] }] };
    await adapter.signAndSendTransactions(txs);
    expect(wallet.getAccounts).not.toHaveBeenCalled();
    expect(wallet.signAndSendTransactions).toHaveBeenCalledWith({
      network: 'testnet',
      signerId: 'alice.near',
      ...txs,
    });
  });

  it('falls back to wallet.getAccounts() when accountId is null', async () => {
    const wallet = {
      signAndSendTransactions: vi.fn(),
      getAccounts: vi.fn(async () => [{ accountId: 'bob.near' }]),
    };
    const adapter = nearConnectAdapter(wallet, null);
    expect(await adapter.accountId()).toBe('bob.near');
  });

  it('throws when wallet is null', () => {
    expect(() => nearConnectAdapter(null, 'alice.near')).toThrow(
      /not signed in/
    );
  });
});

describe.skipIf(!hasEd25519)('Ed25519 keygen (WebCrypto)', () => {
  it('generates a valid ed25519: prefixed key + working signer', async () => {
    const k = await generateEd25519Key();
    expect(k.publicKey.startsWith('ed25519:')).toBe(true);
    const sig = await k.sign(new Uint8Array([1, 2, 3]));
    expect(sig).toBeInstanceOf(Uint8Array);
    expect(sig.length).toBe(64);
  });

  it('restoreEd25519Key produces a working signer for the same public key', async () => {
    const k = await generateEd25519Key();
    const restored = await restoreEd25519Key(k.secretSeedB64u, k.publicKey);
    expect(restored.publicKey).toBe(k.publicKey);
    const msg = new Uint8Array([7, 8, 9]);
    const a = await k.sign(msg);
    const b = await restored.sign(msg);
    expect(b).toEqual(a);
  });
});

describe.skipIf(!hasEd25519)(
  'bootstrapSession / restoreSession / revokeSession',
  () => {
    it('runs the full happy-path lifecycle for a core session', async () => {
      const sent: Array<{ receiverId: string; actions: unknown[] }> = [];
      const wallet: WalletAdapter = {
        accountId: () => 'alice.near',
        signAndSendTransactions: vi.fn(async ({ transactions }) => {
          sent.push(...transactions);
        }),
      };
      const store = new MemoryKeyStore();

      const session = await bootstrapSession({
        wallet,
        network: 'mainnet',
        contract: 'core',
        path: 'apps/myapp/',
        functionCallKey: { allowanceYocto: '250000000000000000000000' },
        store,
        startingNonce: 12_345,
      });

      expect(session.accountId).toBe('alice.near');
      expect(session.currentNonce).toBe(12_345);
      expect(sent).toHaveLength(2);
      expect(sent[0].receiverId).toBe('alice.near');
      expect(sent[1].receiverId).toBe(session.contractId);

      // Persistence
      const stored = await store.get(
        sessionId('alice.near', 'core', 'apps/myapp/')
      );
      expect(stored).not.toBeNull();
      expect(stored!.publicKey).toBe(session.key.publicKey);
      expect(stored!.lastNonce).toBe(12_344);

      // Restore — same public key, no popup
      const restored = await restoreSession({
        store,
        accountId: 'alice.near',
        contract: 'core',
        path: 'apps/myapp/',
      });
      expect(restored).not.toBeNull();
      expect(restored!.key.publicKey).toBe(session.key.publicKey);

      // Signers must produce identical sigs for the same input
      const msg = new Uint8Array([42]);
      expect(await restored!.key.sign(msg)).toEqual(
        await session.key.sign(msg)
      );

      // Revoke
      sent.length = 0;
      await revokeSession({
        wallet,
        publicKey: session.key.publicKey,
        contract: 'core',
        path: 'apps/myapp/',
        network: 'mainnet',
        store,
        accountId: 'alice.near',
      });
      expect(sent).toHaveLength(2); // DeleteKey + execute(set_key_permission level=0)
      const revokeActions = sent[1].actions as Array<{
        type: string;
        params: Record<string, unknown>;
      }>;
      expect(revokeActions).toHaveLength(1);
      expect(revokeActions[0].type).toBe('FunctionCall');
      expect(revokeActions[0].params.args).toEqual({
        request: {
          action: {
            type: 'set_key_permission',
            public_key: session.key.publicKey,
            path: 'apps/myapp/',
            level: 0,
            expires_at: '0',
          },
        },
      });
      expect(
        await store.get(sessionId('alice.near', 'core', 'apps/myapp/'))
      ).toBeNull();
    });

    it('returns null from restore when no entry exists', async () => {
      const store = new MemoryKeyStore();
      const restored = await restoreSession({
        store,
        accountId: 'alice.near',
        contract: 'core',
        path: 'apps/myapp/',
      });
      expect(restored).toBeNull();
    });

    it('expires stale restore entries', async () => {
      const store = new MemoryKeyStore();
      const k = await generateEd25519Key();
      await store.set(sessionId('alice.near', 'core', 'apps/x/'), {
        v: 2,
        accountId: 'alice.near',
        contract: 'core',
        contractId: 'core.onsocial.near',
        network: 'mainnet',
        publicKey: k.publicKey,
        secretSeedB64u: k.secretSeedB64u,
        path: 'apps/x/',
        lastNonce: 0,
        expiresAtMs: Date.now() - 1000,
      });
      const restored = await restoreSession({
        store,
        accountId: 'alice.near',
        contract: 'core',
        path: 'apps/x/',
      });
      expect(restored).toBeNull();
      expect(
        await store.get(sessionId('alice.near', 'core', 'apps/x/'))
      ).toBeNull();
    });
  }
);

// Silence vitest: top-level await requires module env
beforeAll(() => undefined);
afterAll(() => undefined);
