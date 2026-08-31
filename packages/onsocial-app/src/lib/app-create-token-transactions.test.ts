import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const TEST_HASH = '9pEKLq5UaD3K2Jd1fQe8yH7mN4vR6tXwYzBcDeFgHiJkLm';

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

describe('sendCreateUserTokenTransaction', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv('NEXT_PUBLIC_FT_TEMPLATE_CODE_HASH', TEST_HASH);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('batches create → fund → global deploy → mint in one tx', async () => {
    const { sendCreateUserTokenTransaction } = await import(
      '@/lib/app-create-token-transactions'
    );
    const { calls, wallet } = mockWallet();

    const hashes = await sendCreateUserTokenTransaction(
      async () => ({ wallet: wallet as never, accountId: 'alice.testnet' }),
      {
        contractId: 'cool.alice.testnet',
        name: 'Cool Token',
        symbol: 'COOL',
        totalSupply: '1000000000000000000000000',
        icon: 'data:image/svg+xml,x',
      }
    );

    expect(hashes).toEqual(['tx-hash-1']);
    expect(calls).toHaveLength(1);
    const call = calls[0]!;
    expect(call.receiverId).toBe('cool.alice.testnet');
    expect(call.actions.map((a) => a.type)).toEqual([
      'CreateAccount',
      'Transfer',
      'UseGlobalContract',
      'FunctionCall',
    ]);

    const deploy = call.actions[2]!;
    expect(deploy.params).toEqual({
      contractIdentifier: { codeHash: TEST_HASH },
    });

    const mint = call.actions[3]!;
    expect(mint.params?.methodName).toBe('new');
    expect(mint.params?.args).toMatchObject({
      owner_id: 'alice.testnet',
      name: 'Cool Token',
      symbol: 'COOL',
    });
  });

  it('appends renounce_owner only when lock admin is chosen', async () => {
    const { sendCreateUserTokenTransaction } = await import(
      '@/lib/app-create-token-transactions'
    );
    const { calls, wallet } = mockWallet();

    await sendCreateUserTokenTransaction(
      async () => ({ wallet: wallet as never, accountId: 'alice.testnet' }),
      {
        contractId: 'cool.alice.testnet',
        name: 'Cool Token',
        symbol: 'COOL',
        totalSupply: '1000000000000000000',
        icon: 'data:image/svg+xml,x',
        renounceOwner: true,
      }
    );

    const actions = calls[0]!.actions;
    expect(actions).toHaveLength(5);
    expect(actions[4]!.params?.methodName).toBe('renounce_owner');
  });

  it('uses the published testnet hash when env is empty', async () => {
    vi.stubEnv('NEXT_PUBLIC_NEAR_NETWORK', 'testnet');
    vi.stubEnv('NEXT_PUBLIC_FT_TEMPLATE_CODE_HASH', '');
    vi.stubEnv('NEXT_PUBLIC_FT_TEMPLATE_GLOBAL_ACCOUNT', '');
    vi.resetModules();
    const { sendCreateUserTokenTransaction } = await import(
      '@/lib/app-create-token-transactions'
    );
    const { TESTNET_FT_TEMPLATE_CODE_HASH } = await import(
      '@/lib/app-ft-template-config'
    );
    const { calls, wallet } = mockWallet();

    await sendCreateUserTokenTransaction(
      async () => ({ wallet: wallet as never, accountId: 'alice.testnet' }),
      {
        contractId: 'cool.alice.testnet',
        name: 'Cool Token',
        symbol: 'COOL',
        totalSupply: '1000000000000000000',
        icon: 'data:image/svg+xml,x',
      }
    );

    expect(calls[0]!.actions[2]!.params).toEqual({
      contractIdentifier: { codeHash: TESTNET_FT_TEMPLATE_CODE_HASH },
    });
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
        {
          contractId: 'cool.alice.testnet',
          name: 'Cool Token',
          symbol: 'COOL',
          totalSupply: '1000000000000000000',
          icon: 'data:image/svg+xml,x',
        }
      )
    ).rejects.toThrow(/not configured/i);
    expect(calls).toHaveLength(0);
  });
});
