import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  generateEd25519Key,
  resolveContractId,
  sessionId,
} from '@onsocial/sdk/advanced';
import { ACTIVE_NEAR_NETWORK } from '@/lib/app-config';

const viewFunctionCallAccessKey = vi.fn();

vi.mock('@/lib/near-access-key', () => ({
  viewFunctionCallAccessKey: (...args: unknown[]) =>
    viewFunctionCallAccessKey(...args),
}));

vi.mock('@/lib/welcome-near', () => ({
  accountNeedsAppSessionSponsor: vi.fn(async () => false),
  fundAppSessionIfNeeded: vi.fn(async () => {}),
  resolveAppSessionKeyAllowanceYocto: vi.fn(
    async () => '8000000000000000000000'
  ),
}));

import {
  grantAppSocialSession,
  renewAppSocialSession,
} from '@/lib/app-social-session';

const CORE_ID = resolveContractId(ACTIVE_NEAR_NETWORK, 'core');
const ACCOUNT = 'alice.testnet';
const ALLOWANCE = '8000000000000000000000';

function installStorage() {
  const store = new Map<string, string>();
  const localStorage = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
  };
  vi.stubGlobal('localStorage', localStorage);
  vi.stubGlobal('window', {
    localStorage,
    setTimeout,
    clearTimeout,
  });
  return localStorage;
}

function accessKey(onChain: boolean) {
  if (!onChain) return null;
  return {
    receiverId: CORE_ID,
    methodNames: ['execute'],
    allowanceYocto: ALLOWANCE,
  };
}

describe('owner app session grant', () => {
  let onChain = false;
  let storage: ReturnType<typeof installStorage>;
  const signAndSendTransactions = vi.fn();

  beforeEach(() => {
    onChain = false;
    storage = installStorage();
    viewFunctionCallAccessKey.mockReset();
    viewFunctionCallAccessKey.mockImplementation(async () =>
      accessKey(onChain)
    );
    signAndSendTransactions.mockReset();
    signAndSendTransactions.mockImplementation(async () => {
      onChain = true;
      return { transactionHash: 'addkeyhash' };
    });
  });

  it('emits only AddKey for Allow', async () => {
    const result = await grantAppSocialSession({
      accountId: ACCOUNT,
      wallet: { signAndSendTransactions } as never,
    });

    expect(result.ready).toBe(true);
    expect(result.txHashes).toEqual(['addkeyhash']);
    expect(signAndSendTransactions).toHaveBeenCalledTimes(1);
    const transactions = signAndSendTransactions.mock.calls[0]?.[0]
      ?.transactions as Array<{
      receiverId: string;
      actions: Array<{ type: string }>;
    }>;
    expect(transactions).toHaveLength(1);
    expect(transactions[0]?.receiverId).toBe(ACCOUNT);
    expect(transactions[0]?.actions.map((action) => action.type)).toEqual([
      'AddKey',
    ]);
    const encoded = JSON.stringify(transactions);
    expect(encoded).not.toMatch(
      /execute_admin|set_key_permission|FunctionCall/
    );
    expect(encoded).toContain(CORE_ID);
    expect(encoded).toContain(ALLOWANCE);
  });

  it('renews an on-account key without another wallet action', async () => {
    const key = await generateEd25519Key();
    onChain = true;
    const storageId = sessionId(ACCOUNT, 'core', `${ACCOUNT}/`);
    storage.setItem(
      `onsocial.app.session.${storageId}`,
      JSON.stringify({
        v: 2,
        accountId: ACCOUNT,
        contract: 'core',
        contractId: CORE_ID,
        network: ACTIVE_NEAR_NETWORK,
        publicKey: key.publicKey,
        secretSeedB64u: key.secretSeedB64u,
        path: `${ACCOUNT}/`,
        lastNonce: 1,
        expiresAtMs: Date.now() - 1_000,
      })
    );

    const result = await renewAppSocialSession({
      accountId: ACCOUNT,
      wallet: { signAndSendTransactions } as never,
    });

    expect(signAndSendTransactions).not.toHaveBeenCalled();
    expect(result).toEqual({ ready: true, txHashes: [] });
    const stored = JSON.parse(
      storage.getItem(`onsocial.app.session.${storageId}`) ?? 'null'
    ) as { expiresAtMs?: number };
    expect(stored.expiresAtMs).toBeGreaterThan(Date.now());
  });
});
