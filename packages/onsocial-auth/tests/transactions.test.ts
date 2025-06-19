import { formatTransaction, signAndSendTransaction } from '../src/transactions';
jest.mock('../src/wallet', () => ({
  getHereWallet: jest.fn(async () => ({
    signAndSendTransaction: jest.fn(async (tx) => `tx:${JSON.stringify(tx)}`),
  })),
}));

describe('transactions', () => {
  it('formats transaction', async () => {
    const tx = await formatTransaction({
      actions: [{ type: 'transfer' }],
      receiverId: 'test',
    });
    expect(tx).toEqual({ actions: [{ type: 'transfer' }], receiverId: 'test' });
  });

  it('signs and sends transaction', async () => {
    const result = await signAndSendTransaction({ foo: 'bar' });
    expect(result).toContain('tx:');
  });
});

describe('transactions errors', () => {
  it('signAndSendTransaction throws if getHereWallet fails', async () => {
    const { signAndSendTransaction } = require('../src/transactions');
    require('../src/wallet').getHereWallet = jest.fn(async () => {
      throw new Error('fail');
    });
    await expect(signAndSendTransaction({ foo: 'bar' })).rejects.toThrow(
      'fail'
    );
  });
});
