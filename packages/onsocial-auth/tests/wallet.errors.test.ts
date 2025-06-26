import { vi, describe, it, expect, afterEach } from 'vitest';

// wallet.errors.test.ts
// Error-handling tests for wallet module, with no global mock for @here-wallet/core

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const setupWallet = async (walletMethods: Record<string, any> = {}) => {
  vi.doMock('@here-wallet/core', () => {
    class MockHereWallet {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      static async connect(__options?: any) {
        return new MockHereWallet();
      }
      init: unknown;
      constructor() {
        this.init = vi.fn();
        Object.assign(this, walletMethods);
      }
    }
    return { HereWallet: MockHereWallet };
  });
  const walletModule = await import('../src/wallet');
  walletModule._resetHereWallet();
  return walletModule;
};

describe('wallet errors', () => {
  afterEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
  });

  it('getHereWallet throws', async () => {
    const walletModule = await setupWallet();
    vi.spyOn(walletModule, 'getHereWallet').mockImplementationOnce(async () => {
      throw new Error('fail');
    });
    await expect(walletModule.getHereWallet()).rejects.toThrow('fail');
  });
  it('signIn throws', async () => {
    const walletModule = await setupWallet({
      signIn: async () => {
        throw new Error('fail');
      },
    });
    await expect(walletModule.signIn({ contractId: 'test' })).rejects.toThrow(
      'fail'
    );
  });
  it('signAndSendTransaction throws', async () => {
    const walletModule = await setupWallet({
      signAndSendTransaction: async () => {
        throw new Error('fail');
      },
    });
    await expect(
      walletModule.signAndSendTransaction({ actions: [], foo: 'bar' })
    ).rejects.toThrow('fail');
  });
  it('signMessage throws', async () => {
    const walletModule = await setupWallet({
      signMessage: async () => {
        throw new Error('fail');
      },
    });
    await expect(
      walletModule.signMessage({
        message: 'msg',
        recipient: 'rec',
        nonce: new Uint8Array([1, 2, 3]),
      })
    ).rejects.toThrow('fail');
  });
});
