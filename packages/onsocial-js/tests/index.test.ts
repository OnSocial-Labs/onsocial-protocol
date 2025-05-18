import { describe, it, expect, vi } from 'vitest';
import { OnSocialSDK } from '../src';

// Mock the cross-fetch module
vi.mock('cross-fetch', () => ({
  default: vi.fn(),
}));

describe('OnSocialSDK', () => {
  const sdk = new OnSocialSDK({ network: 'testnet' });

  it('should initialize with correct RPC', () => {
    expect(sdk).toBeDefined();
    expect(sdk['rpcUrl']).toBe('https://test.rpc.fastnear.com');
  });

  it('should call fastGet (mocked)', async () => {
    const mockPosts = [
      { id: '1', content: 'test', author: 'user1', timestamp: 1234567890 },
    ];
    const fetchMock = (await import('cross-fetch'))
      .default as unknown as typeof import('cross-fetch').default & {
      mockResolvedValue: (value: { json: () => Promise<unknown> }) => void;
    };
    fetchMock.mockResolvedValue({
      json: async () => ({
        jsonrpc: '2.0',
        id: 'dontcare',
        result: {
          result: Buffer.from(JSON.stringify(mockPosts)).toJSON().data,
          status: 'SuccessValue',
          block_height: 123456,
          block_hash: 'mockHash',
        },
      }),
    });

    const result = await sdk.fastGet('get_posts', { limit: 10 });
    expect(result).toEqual(mockPosts);
    expect(fetchMock).toHaveBeenCalledWith(
      'https://test.rpc.fastnear.com',
      expect.any(Object)
    );
  });

  it('should login with biometrics', async () => {
    const result = await sdk.loginWithBiometrics('1234');
    expect(result.publicKey).toBeDefined();
  });
});
