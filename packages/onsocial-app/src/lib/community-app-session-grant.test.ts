import { beforeEach, describe, expect, it, vi } from 'vitest';

const viewFunctionCallAccessKey = vi.fn();
const signAndSendTransactions = vi.fn();

vi.mock('@/lib/near-access-key', () => ({
  viewFunctionCallAccessKey: (...args: unknown[]) =>
    viewFunctionCallAccessKey(...args),
}));

vi.mock('@onsocial/sdk/advanced', async () => {
  const actual = await vi.importActual<typeof import('@onsocial/sdk/advanced')>(
    '@onsocial/sdk/advanced'
  );
  return {
    ...actual,
    resolveContractId: () => 'core.onsocial.testnet',
  };
});

import { grantCommunityAppSession } from '@/lib/community-app-session-grant';

describe('grantCommunityAppSession', () => {
  beforeEach(() => {
    viewFunctionCallAccessKey.mockReset();
    signAndSendTransactions.mockReset();
  });

  it('skips the wallet when the public key is already on core', async () => {
    viewFunctionCallAccessKey.mockResolvedValue({
      receiverId: 'core.onsocial.testnet',
      methodNames: ['execute'],
      allowanceYocto: '1',
    });
    const result = await grantCommunityAppSession({
      accountId: 'bob.testnet',
      appId: 'tracker',
      publicKey: 'ed25519:8hK7pQ2nVxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
      wallet: { signAndSendTransactions } as never,
    });
    expect(result.skipped).toBe(true);
    expect(signAndSendTransactions).not.toHaveBeenCalled();
  });

  it('rejects a key bound to another contract', async () => {
    viewFunctionCallAccessKey.mockResolvedValue({
      receiverId: 'scarces.onsocial.testnet',
      methodNames: ['execute'],
      allowanceYocto: '1',
    });
    await expect(
      grantCommunityAppSession({
        accountId: 'bob.testnet',
        appId: 'tracker',
        publicKey: 'ed25519:8hK7pQ2nVxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
        wallet: { signAndSendTransactions } as never,
      })
    ).rejects.toThrow(/another contract/);
  });
});
