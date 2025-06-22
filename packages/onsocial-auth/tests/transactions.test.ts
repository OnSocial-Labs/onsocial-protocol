import { formatTransaction, signAndSendTransaction } from '../src/transactions';
import { vi } from 'vitest';
vi.mock('../src/wallet', () => ({
  getHereWallet: vi.fn(async () => ({
    signAndSendTransaction: vi.fn(async (tx) => `tx:${JSON.stringify(tx)}`),
  })),
}));

describe('transactions', () => {
  it('formats transaction', async () => {
    const tx = await formatTransaction({
      actions: [
        { type: 'Transfer', params: { deposit: '1000000000000000000000000' } },
      ],
      receiverId: 'test',
    });
    expect(tx).toEqual({
      actions: [
        { type: 'Transfer', params: { deposit: '1000000000000000000000000' } },
      ],
      receiverId: 'test',
    });
  });

  it('signs and sends transaction', async () => {
    const result = await signAndSendTransaction({ actions: [], foo: 'bar' });
    expect(result).toContain('tx:');
  });
});

describe('transactions errors', () => {
  it('signAndSendTransaction throws if getHereWallet fails', async () => {
    const { signAndSendTransaction } = await import('../src/transactions');
    const walletModule = await import('../src/wallet');
    walletModule.getHereWallet = vi.fn(async () => {
      throw new Error('fail');
    });
    await expect(
      signAndSendTransaction({ actions: [], foo: 'bar' })
    ).rejects.toThrow('fail');
  });
});
