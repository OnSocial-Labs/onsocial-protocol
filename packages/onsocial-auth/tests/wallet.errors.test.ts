// wallet.errors.test.ts
// Error-handling tests for wallet module, with no global mock for @here-wallet/core

const setupWallet = (walletMethods: Record<string, any> = {}) => {
  jest.doMock('@here-wallet/core', () => {
    class MockHereWallet {
      static async connect(options?: any) {
        return new MockHereWallet();
      }
      init: any;
      constructor() {
        this.init = jest.fn();
        Object.assign(this, walletMethods);
      }
    }
    return { HereWallet: MockHereWallet };
  });
  const walletModule = require('../src/wallet');
  walletModule._resetHereWallet();
  return walletModule;
};

describe('wallet errors', () => {
  afterEach(() => {
    jest.resetModules();
    jest.restoreAllMocks();
  });

  it('getHereWallet throws', async () => {
    const walletModule = setupWallet();
    jest
      .spyOn(walletModule, 'getHereWallet')
      .mockImplementationOnce(async () => {
        throw new Error('fail');
      });
    await expect(walletModule.getHereWallet()).rejects.toThrow('fail');
  });
  it('signIn throws', async () => {
    const walletModule = setupWallet({
      signIn: async () => {
        throw new Error('fail');
      },
    });
    await expect(walletModule.signIn({ contractId: 'test' })).rejects.toThrow(
      'fail'
    );
  });
  it('signAndSendTransaction throws', async () => {
    const walletModule = setupWallet({
      signAndSendTransaction: async () => {
        throw new Error('fail');
      },
    });
    await expect(
      walletModule.signAndSendTransaction({ foo: 'bar' })
    ).rejects.toThrow('fail');
  });
  it('signMessage throws', async () => {
    const walletModule = setupWallet({
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
