import axios from 'axios';
import { getJWT } from '../src/auth';

jest.mock('axios');
jest.mock('../src/wallet', () => ({
  signMessage: jest.fn(async ({ message, recipient, nonce }) => ({
    signature: 'mock-signature',
    accountId: 'mock-account',
    publicKey: 'mock-pubkey',
    message,
    recipient,
    nonce,
  })),
}));
jest.mock('../src/storage', () => ({
  saveToken: jest.fn(async (jwt) => jwt),
}));

describe('auth', () => {
  it('gets JWT and saves it', async () => {
    (axios.post as jest.Mock).mockResolvedValue({
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
    (axios.post as jest.Mock).mockRejectedValue(new Error('network error'));
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
    const wallet = require('../src/wallet');
    wallet.signMessage.mockImplementationOnce(async () => {
      throw new Error('sign error');
    });
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
