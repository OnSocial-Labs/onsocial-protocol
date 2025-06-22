import axios from 'axios';
import { getJWT } from '../src/auth';
import { vi } from 'vitest';

vi.mock('axios');
vi.mock('../src/wallet', () => ({
  signMessage: vi.fn(async ({ message, recipient, nonce }) => ({
    signature: 'mock-signature',
    accountId: 'mock-account',
    publicKey: 'mock-pubkey',
    message,
    recipient,
    nonce,
  })),
}));
vi.mock('../src/storage', () => ({
  saveToken: vi.fn(async (jwt) => jwt),
}));

describe('auth', () => {
  it('gets JWT and saves it', async () => {
    (axios.post as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { token: 'jwt-token' },
    });
    const token = await getJWT({
      message: 'msg',
      recipient: 'rec',
      nonce: new Uint8Array([1, 2, 3]),
      apiUrl: 'http://api',
    });
    expect(token).toBe('jwt-token');
    expect(axios.post).toHaveBeenCalledWith(
      'http://api/auth/login',
      expect.any(Object)
    );
  });

  it('throws if axios.post fails', async () => {
    (axios.post as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error('network error')
    );
    await expect(
      getJWT({
        message: 'msg',
        recipient: 'rec',
        nonce: new Uint8Array([1, 2, 3]),
        apiUrl: 'http://api',
      })
    ).rejects.toThrow('network error');
  });

  it('throws if signMessage fails', async () => {
    const wallet = await import('../src/wallet');
    (wallet.signMessage as ReturnType<typeof vi.fn>).mockImplementationOnce(
      async () => {
        throw new Error('sign error');
      }
    );
    await expect(
      getJWT({
        message: 'msg',
        recipient: 'rec',
        nonce: new Uint8Array([1, 2, 3]),
        apiUrl: 'http://api',
      })
    ).rejects.toThrow('sign error');
  });
});
