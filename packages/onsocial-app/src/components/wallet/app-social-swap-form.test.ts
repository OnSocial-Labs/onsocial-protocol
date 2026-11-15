// @ts-nocheck — renderer tests follow the existing panel harness, which has no renderer types.
import { act, createElement } from 'react';
import { create } from 'react-test-renderer';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppSocialSwapForm } from '@/components/wallet/app-social-swap-form';

vi.mock('@/lib/app-swap-config', async () => {
  const actual = await vi.importActual<typeof import('@/lib/app-swap-config')>(
    '@/lib/app-swap-config'
  );
  return { ...actual, APP_SWAP_ENABLED: true };
});

vi.mock('@/contexts/app-wallet-context', () => ({
  useAppWallet: () => ({
    isConnected: true,
    accountId: 'alice.near',
    isBootstrappingSession: false,
    connect: vi.fn(),
    getSigningWallet: vi.fn(async () => {
      throw new Error('wallet down');
    }),
  }),
}));

vi.mock('@/contexts/app-transaction-feedback-context', () => ({
  useAppTransactionFeedback: () => ({
    setTxResult: vi.fn(),
    trackTransaction: vi.fn(),
  }),
}));

vi.mock('@/contexts/app-social-balance-context', () => ({
  useAppSocialBalance: () => ({
    balanceYocto: 0n,
    hasLoadedBalance: true,
    loading: false,
    error: null,
    refresh: vi.fn(async () => {}),
  }),
}));

const realSetTimeout = globalThis.setTimeout.bind(globalThis);

describe('swap form', () => {
  beforeEach(() => {
    vi.stubGlobal('window', {
      setInterval: () => 0,
      clearInterval: () => {},
      setTimeout: realSetTimeout,
      clearTimeout: () => {},
      localStorage: {
        getItem: () => null,
        setItem: () => {},
        removeItem: () => {},
      },
    });
    vi.stubGlobal('document', {
      hidden: true,
      addEventListener: () => {},
      removeEventListener: () => {},
    });
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/api/swap/prepare')) {
        return new Response(
          JSON.stringify({
            success: true,
            transactions: [{ receiverId: 'ref.near', functionCalls: [] }],
          }),
          { status: 200, headers: { 'content-type': 'application/json' } }
        );
      }
      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }));
    vi.stubGlobal('matchMedia', () => ({
      matches: false,
      addEventListener: () => {},
      removeEventListener: () => {},
    }));
  });

  it('clears swapping when signing fails after prepare', async () => {
    let renderer: ReturnType<typeof create> | null = null;
    await act(async () => {
      renderer = create(createElement(AppSocialSwapForm));
    });
    const amount = renderer!.root.findByProps({
      'aria-label': 'Amount in NEAR',
    });
    await act(async () => {
      amount.props.onValueChange('1');
    });
    const swap = renderer!.root.findAll(
      (node) => node.props?.pendingLabel === 'Getting SOCIAL…'
    )[0];
    await act(async () => {
      await swap.props.onClick();
    });
    const after = renderer!.root.findAll(
      (node) => node.props?.pendingLabel === 'Getting SOCIAL…'
    )[0];
    expect(after.props.pending).toBe(false);
  });
});
