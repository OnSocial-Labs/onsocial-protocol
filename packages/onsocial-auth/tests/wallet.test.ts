jest.mock('@here-wallet/core', () => {
  // Mock class with static connect method
  class MockHereWallet {
    static async connect(options?: any) {
      return new MockHereWallet();
    }
    init = jest.fn();
    signIn = jest.fn(async ({ contractId }) => `signed-in:${contractId}`);
    signAndSendTransaction = jest.fn(async (tx) => `tx:${JSON.stringify(tx)}`);
    signMessage = jest.fn(async ({ message, recipient, nonce }) => ({
      signature: 'mock-signature',
      accountId: 'mock-account',
      publicKey: 'mock-pubkey',
      message,
      recipient,
      nonce,
    }));
  }
  return { HereWallet: MockHereWallet };
});

import {
  getHereWallet,
  connectWallet,
  signIn,
  signAndSendTransaction,
  signMessage,
} from '../src/wallet';

describe('wallet', () => {
  it('gets HereWallet instance', async () => {
    const wallet = await getHereWallet();
    expect(wallet).toBeDefined();
  });

  it('connects wallet', async () => {
    const wallet = await connectWallet();
    expect(wallet).toBeDefined();
  });

  it('signs in', async () => {
    const result = await signIn({ contractId: 'test' });
    expect(result).toBe('signed-in:test');
  });

  it('signs and sends transaction', async () => {
    const result = await signAndSendTransaction({ foo: 'bar' });
    expect(result).toContain('tx:');
  });

  it('signs message', async () => {
    const result = await signMessage({
      message: 'msg',
      recipient: 'rec',
      nonce: new Uint8Array([1, 2, 3]),
    });
    expect(result.signature).toBe('mock-signature');
  });
});
