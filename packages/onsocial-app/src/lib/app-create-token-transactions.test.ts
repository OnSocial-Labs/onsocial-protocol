import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const FACTORY_PUBLIC_KEY = 'ed25519:11111111111111111111111111111111';

interface RecordedCall {
  receiverId: string;
  actions: Array<{ type: string; params?: Record<string, unknown> }>;
}

function mockWallet() {
  const calls: RecordedCall[] = [];
  const wallet = {
    signAndSendTransaction: vi.fn(
      async (req: { receiverId: string; actions: RecordedCall['actions'] }) => {
        calls.push({ receiverId: req.receiverId, actions: req.actions });
        return { transaction: { hash: 'tx-hash-1' } };
      }
    ),
  };
  return { calls, wallet };
}

function stubFactory(body: { ready: boolean; publicKey?: string }) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({
      ok: true,
      json: async () => body,
    }))
  );
}

describe('sendCreateUserTokenTransaction', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv(
      'NEXT_PUBLIC_FT_TEMPLATE_CODE_HASH',
      '9pEKLq5UaD3K2Jd1fQe8yH7mN4vR6tXwYzBcDeFgHiJkLm'
    );
    stubFactory({ ready: true, publicKey: FACTORY_PUBLIC_KEY });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('signs create, fund, and the factory full-access key', async () => {
    const { sendCreateUserTokenTransaction } = await import(
      '@/lib/app-create-token-transactions'
    );
    const { calls, wallet } = mockWallet();

    const hashes = await sendCreateUserTokenTransaction(
      async () => ({ wallet: wallet as never, accountId: 'alice.testnet' }),
      { contractId: 'cool.alice.testnet' }
    );

    expect(hashes).toEqual(['tx-hash-1']);
    expect(calls).toHaveLength(1);
    const call = calls[0]!;
    expect(call.receiverId).toBe('cool.alice.testnet');
    expect(call.actions.map((action) => action.type)).toEqual([
      'CreateAccount',
      'Transfer',
      'AddKey',
    ]);
    expect(call.actions[2]!.params).toEqual({
      publicKey: FACTORY_PUBLIC_KEY,
      accessKey: { permission: 'FullAccess' },
    });
    expect(JSON.stringify(call.actions)).not.toContain('UseGlobalContract');
    expect(JSON.stringify(call.actions)).not.toContain('renounce_owner');
  });

  it('does not sign when the factory key is missing', async () => {
    stubFactory({ ready: false });
    vi.resetModules();
    const { sendCreateUserTokenTransaction } = await import(
      '@/lib/app-create-token-transactions'
    );
    const { calls, wallet } = mockWallet();

    await expect(
      sendCreateUserTokenTransaction(
        async () => ({ wallet: wallet as never, accountId: 'alice.testnet' }),
        { contractId: 'cool.alice.testnet' }
      )
    ).rejects.toThrow(/factory is not ready/i);
    expect(calls).toHaveLength(0);
  });

  it('throws when the template is not configured', async () => {
    vi.stubEnv('NEXT_PUBLIC_NEAR_NETWORK', 'mainnet');
    vi.stubEnv('NEXT_PUBLIC_FT_TEMPLATE_CODE_HASH', '');
    vi.stubEnv('NEXT_PUBLIC_FT_TEMPLATE_GLOBAL_ACCOUNT', '');
    vi.resetModules();
    const { sendCreateUserTokenTransaction } = await import(
      '@/lib/app-create-token-transactions'
    );
    const { calls, wallet } = mockWallet();

    await expect(
      sendCreateUserTokenTransaction(
        async () => ({ wallet: wallet as never, accountId: 'alice.testnet' }),
        { contractId: 'cool.alice.testnet' }
      )
    ).rejects.toThrow(/not configured/i);
    expect(calls).toHaveLength(0);
  });
});
