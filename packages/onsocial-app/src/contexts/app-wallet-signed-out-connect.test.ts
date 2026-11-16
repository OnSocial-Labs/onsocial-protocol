// @ts-nocheck — renderer tests follow the existing panel harness, which has no renderer types.
import { act, createElement, useEffect, type ReactNode } from 'react';
import {
  create,
  type ReactTestInstance,
  type ReactTestRenderer,
} from 'react-test-renderer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  AppTransactionFeedbackProvider,
  useAppTransactionFeedback,
} from '@/contexts/app-transaction-feedback-context';
import { AppWalletProvider, useAppWallet } from '@/contexts/app-wallet-context';
import { TransactionFeedbackToast } from '@/components/ui/transaction-feedback-toast';
import { AppCreateTokenSheet } from '@/features/tokens/app-create-token-sheet';
import { AppAccessSheet } from '@/components/wallet/app-access-sheet';
import { OsDockAccountZone } from '@/components/wallet/os-dock-account-zone';
import { ScarceBuyForm } from '@/features/scarces/scarce-buy-form';
import { ScarceBuySheet } from '@/features/scarces/scarce-buy-sheet';
import { ScarceListForm } from '@/features/scarces/scarce-list-form';
import { ScarceOffersSheet } from '@/features/scarces/scarce-offers-sheet';
import { CreateDropPanel } from '@/features/scarces/create-drop-panel';
import { GenerativeDropBuilder } from '@/features/scarces/generative-drop-builder';
import * as scarceOffers from '@/features/scarces/scarce-offers';
import { ScarceBidForm } from '@/features/scarces/scarce-bid-form';
import { ScarceTransferForm } from '@/features/scarces/scarce-transfer-form';
import { HubPublishRequestsSheet } from '@/features/scarces/hub-publish-requests-sheet';
import { NearAccountField } from '@/components/ui/near-account-field';
import { useOsAppNavigate } from '@/hooks/use-os-app-navigate';
import * as appSocialSession from '@/lib/app-social-session';
import * as welcomeNear from '@/lib/welcome-near';
import * as scarceAuction from '@/features/scarces/scarce-auction';
import * as publishAccess from '@/features/scarces/hub-publish-access';
import { APP_WALLET_ACCOUNT_KEY } from '@/lib/gate-return';
import { isWalletUserCancellation } from '@/lib/wallet-errors';
import { viewNearContract } from '@/lib/app-near-rpc';

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const LOADING = /Wallet is still loading/;
const REVIEW_TEXT = 'Review this account, then confirm.';
const ONE_NEAR_YOCTO = '1000000000000000000000000';
const PAYER_BALANCE_YOCTO = '50000000000000000000000000';
const OWN_LISTING_ERROR = 'You can’t buy your own listing.';

const reviewRpc = {
  balances: new Map<string, string>(),
  prepareCalls: 0,
  viewedAccounts: [] as string[],
};

const harness = vi.hoisted(() => {
  const connect = vi.fn(() => new Promise(() => {}));
  const getConnectedWallet = vi.fn(async () => {
    throw new Error('no wallet');
  });
  const wallets: Array<{
    signAndSendTransaction: ReturnType<typeof vi.fn>;
  }> = [];
  const signInListeners = new Set<
    (event: {
      accounts: Array<{ accountId: string }>;
      wallet?: unknown;
    }) => void
  >();
  const onSignInListeners = new Set<
    (event: {
      accounts: Array<{ accountId: string }>;
      wallet?: unknown;
    }) => void
  >();
  return {
    connect,
    getConnectedWallet,
    wallets,
    signInListeners,
    onSignInListeners,
    emitSignIn(accounts: Array<{ accountId: string }>, wallet?: unknown) {
      const event = { accounts, wallet };
      const once = [...signInListeners];
      signInListeners.clear();
      once.forEach((listener) => listener(event));
      onSignInListeners.forEach((listener) => listener(event));
    },
  };
});

const portal = vi.hoisted(() => ({ calls: 0 }));

const router = vi.hoisted(() => ({
  push: vi.fn(),
  replace: vi.fn(),
  prefetch: vi.fn(),
  back: vi.fn(),
}));

vi.mock('@hot-labs/near-connect', () => {
  class NearConnector {
    connect: typeof harness.connect;
    getConnectedWallet: typeof harness.getConnectedWallet;
    on = (
      event: string,
      listener: (event: {
        accounts: Array<{ accountId: string }>;
        wallet?: unknown;
      }) => void
    ) => {
      if (event === 'wallet:signIn') harness.onSignInListeners.add(listener);
    };
    once = (
      event: string,
      listener: (event: {
        accounts: Array<{ accountId: string }>;
        wallet?: unknown;
      }) => void
    ) => {
      if (event === 'wallet:signIn') harness.signInListeners.add(listener);
    };
    off = (
      event: string,
      listener: (event: {
        accounts: Array<{ accountId: string }>;
        wallet?: unknown;
      }) => void
    ) => {
      if (event === 'wallet:signIn') {
        harness.signInListeners.delete(listener);
        harness.onSignInListeners.delete(listener);
      }
    };
    removeAllListeners = () => {
      harness.signInListeners.clear();
      harness.onSignInListeners.clear();
    };
    disconnect = vi.fn(async () => {});
    constructor() {
      this.connect = harness.connect;
      this.getConnectedWallet = harness.getConnectedWallet;
    }
  }
  return { NearConnector };
});

vi.mock('react-dom', async () => {
  const actual = await vi.importActual<typeof import('react-dom')>('react-dom');
  return {
    ...actual,
    createPortal: (node: unknown) => {
      portal.calls += 1;
      return node;
    },
  };
});

vi.mock('next/navigation', () => ({
  useRouter: () => router,
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('next/link', () => ({
  default: ({ children }: { children?: ReactNode }) => children ?? null,
}));

vi.mock('@/lib/app-near-rpc', async () => {
  const actual =
    await vi.importActual<typeof import('@/lib/app-near-rpc')>(
      '@/lib/app-near-rpc'
    );
  return {
    ...actual,
    viewNearContract: vi.fn(async () => {
      throw new Error('offline');
    }),
  };
});

function deferred<T>() {
  let resolve: (value: T) => void = () => {};
  let reject: (reason?: unknown) => void = () => {};
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function signingWallet(accountId: string) {
  const wallet = makeWallet(accountId);
  wallet.signAndSendTransaction.mockResolvedValue({
    transaction: { hash: 'tx-sign' },
  });
  return wallet;
}

function makeWallet(accountId: string) {
  const wallet = {
    getAccounts: vi.fn(async () => [{ accountId }]),
    signAndSendTransaction: vi.fn(async () => {
      throw new Error('signing was not part of this test');
    }),
    signAndSendTransactions: vi.fn(async () => {
      throw new Error('signing was not part of this test');
    }),
    signMessage: vi.fn(),
  };
  harness.wallets.push(wallet);
  return wallet;
}

function signCallCount(): number {
  return harness.wallets.reduce(
    (total, wallet) => total + wallet.signAndSendTransaction.mock.calls.length,
    0
  );
}

function installBrowser() {
  const storage = new Map<string, string>();
  const listeners = new Map<string, Set<() => void>>();
  const documentListeners = new Map<string, Set<() => void>>();
  const windowStub = {
    localStorage: {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => {
        storage.set(key, value);
      },
      removeItem: (key: string) => {
        storage.delete(key);
      },
    },
    location: {
      href: 'http://localhost:3060/',
      origin: 'http://localhost:3060',
      pathname: '/',
      search: '',
    },
    addEventListener: (type: string, fn: () => void) => {
      const set = listeners.get(type) ?? new Set();
      set.add(fn);
      listeners.set(type, set);
    },
    removeEventListener: (type: string, fn: () => void) => {
      listeners.get(type)?.delete(fn);
    },
    dispatchEvent: (event: Event) => {
      listeners.get(event.type)?.forEach((fn) => fn());
      return true;
    },
    setTimeout: globalThis.setTimeout.bind(globalThis),
    clearTimeout: globalThis.clearTimeout.bind(globalThis),
    requestAnimationFrame: (cb: FrameRequestCallback) =>
      globalThis.setTimeout(() => cb(Date.now()), 16),
    cancelAnimationFrame: (id: number) => {
      globalThis.clearTimeout(id);
    },
    matchMedia: () => ({
      matches: false,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
    }),
    MutationObserver: class {
      observe() {}
      disconnect() {}
      takeRecords() {
        return [];
      }
    },
    ResizeObserver: class {
      observe() {}
      disconnect() {}
      unobserve() {}
    },
  };
  const documentStub = {
    body: {
      style: {
        getPropertyValue: () => '',
        setProperty: () => {},
        removeProperty: () => '',
      },
    },
    hidden: false,
    visibilityState: 'visible',
    activeElement: null,
    documentElement: { clientWidth: 1280, clientHeight: 800 },
    addEventListener: (type: string, fn: () => void) => {
      const set = documentListeners.get(type) ?? new Set();
      set.add(fn);
      documentListeners.set(type, set);
    },
    removeEventListener: (type: string, fn: () => void) => {
      documentListeners.get(type)?.delete(fn);
    },
    createElement: () => ({
      style: {},
      setAttribute() {},
    }),
    querySelector: () => null,
    querySelectorAll: () => [],
    getElementById: () => null,
  };
  vi.stubGlobal('window', windowStub);
  vi.stubGlobal('document', documentStub);
  vi.stubGlobal('MutationObserver', windowStub.MutationObserver);
  vi.stubGlobal('ResizeObserver', windowStub.ResizeObserver);
  vi.stubGlobal('requestAnimationFrame', windowStub.requestAnimationFrame);
  vi.stubGlobal('cancelAnimationFrame', windowStub.cancelAnimationFrame);
  vi.stubGlobal('getComputedStyle', () => ({
    getPropertyValue: () => '',
  }));
  vi.stubGlobal('fetch', testFetch);
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

async function testFetch(input: RequestInfo | URL, init?: RequestInit) {
  const url = String(input);
  if (url.includes('/api/account-exists')) {
    const id =
      new URL(url, 'http://test.local').searchParams.get('accountId') ?? '';
    return jsonResponse({ exists: !id.startsWith('note.') });
  }
  if (url.includes('/api/ft-template')) {
    return jsonResponse({ status: 'ready' });
  }
  if (url.includes('/api/near/rpc')) {
    const body = JSON.parse(String(init?.body ?? '{}')) as {
      method?: string;
      params?: { request_type?: string; account_id?: string };
    };
    if (
      body.method === 'query' &&
      body.params?.request_type === 'view_account'
    ) {
      const accountId = body.params.account_id ?? '';
      reviewRpc.viewedAccounts.push(accountId);
      const amount = reviewRpc.balances.get(accountId);
      if (!amount) return jsonResponse({ error: { message: 'offline' } });
      return jsonResponse({
        result: { amount, locked: '0', storage_usage: 0 },
      });
    }
    if (body.method === 'EXPERIMENTAL_tx_status') {
      return jsonResponse({
        result: {
          final_execution_status: 'FINAL',
          status: { SuccessValue: '' },
          receipts_outcome: [],
        },
      });
    }
  }
  if (url.includes('/compose/prepare/')) {
    reviewRpc.prepareCalls += 1;
    return jsonResponse({
      action: { type: 'purchase' },
      target_account: 'scarces.onsocial.testnet',
    });
  }
  throw new Error('offline');
}

function collectText(node: ReactTestInstance): string {
  return node.children
    .map((child) => (typeof child === 'string' ? child : collectText(child)))
    .join(' ');
}

function findForm(root: ReactTestInstance): ReactTestInstance {
  const forms = root.findAll((node) => node.type === 'form');
  if (forms.length === 0) {
    throw new Error('expected a form');
  }
  return forms[0]!;
}

const apiRef: {
  current: ReturnType<typeof useAppWallet> | null;
} = { current: null };

function Probe() {
  const wallet = useAppWallet();
  useEffect(() => {
    apiRef.current = wallet;
  });
  return null;
}

function Providers({ children }: { children: ReactNode }) {
  return createElement(
    AppWalletProvider,
    null,
    createElement(AppTransactionFeedbackProvider, null, children)
  );
}

function Shell({ children }: { children: ReactNode }) {
  return createElement('div', null, createElement(Probe), children);
}

let renderer: ReactTestRenderer | null = null;
let sessionSpy: ReturnType<typeof vi.spyOn> | null = null;

async function mount(node: ReactNode) {
  await act(async () => {
    renderer = create(createElement(Providers, null, node));
  });
}

async function waitForInit() {
  await expect
    .poll(() => apiRef.current?.isLoading, { interval: 15, timeout: 2000 })
    .toBe(false);
}

async function expectSignedOutPicker() {
  await expect
    .poll(
      async () => {
        await act(async () => {
          findForm(renderer!.root).props.onSubmit({ preventDefault() {} });
        });
        return {
          picker: harness.connect.mock.calls.length,
          loadingToast: LOADING.test(collectText(renderer!.root)),
        };
      },
      { interval: 50, timeout: 3500 }
    )
    .toEqual({ picker: 1, loadingToast: false });
}

describe('signed-out wallet picker', () => {
  beforeEach(() => {
    reviewRpc.balances.clear();
    reviewRpc.prepareCalls = 0;
    reviewRpc.viewedAccounts = [];
    installBrowser();
    harness.wallets.length = 0;
    harness.signInListeners.clear();
    harness.onSignInListeners.clear();
    harness.connect.mockReset();
    harness.connect.mockImplementation(() => new Promise(() => {}));
    harness.getConnectedWallet.mockReset();
    harness.getConnectedWallet.mockRejectedValue(new Error('no wallet'));
    router.push.mockReset();
    apiRef.current = null;
    sessionSpy = vi
      .spyOn(appSocialSession, 'bootstrapAppSocialSession')
      .mockResolvedValue(false);
    vi.spyOn(scarceAuction, 'fetchScarceAuctionView').mockResolvedValue({
      tokenId: 'lot-1',
      sellerId: 'seller.near',
      reservePriceYocto: '1000000000000000000000000',
      minBidIncrementYocto: '100000000000000000000000',
      highestBidYocto: '0',
      highestBidder: null,
      bidCount: 0,
      expiresAtNs: null,
      buyNowPriceYocto: null,
      isEnded: false,
      reserveMet: false,
    });
    vi.spyOn(publishAccess, 'fetchPublishRequests').mockImplementation(
      async (_appId, status) =>
        status === 'pending'
          ? [
              {
                accountId: 'maker.near',
                status: 'pending',
                message: null,
                requestedAtMs: 1_700_000_000_000,
                decidedBy: null,
              },
            ]
          : []
    );
  });

  afterEach(() => {
    act(() => {
      renderer?.unmount();
    });
    renderer = null;
    sessionSpy?.mockRestore();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('opens one picker after init, throws while init is running, and keeps a signed-in wallet', async () => {
    const signedIn = makeWallet('alice.near');
    harness.getConnectedWallet.mockResolvedValue({
      wallet: signedIn,
      accounts: [{ accountId: 'alice.near' }],
    });
    await mount(createElement(Probe));
    await expect
      .poll(() => apiRef.current?.accountId, { interval: 15, timeout: 2000 })
      .toBe('alice.near');
    const signed = await apiRef.current!.getSigningWallet();
    expect(signed.accountId).toBe('alice.near');
    expect(signed.wallet).toBe(signedIn);
    expect(harness.connect).not.toHaveBeenCalled();
    expect(apiRef.current?.accountId).toBe('alice.near');
    expect(signCallCount()).toBe(0);
    expect(sessionSpy).not.toHaveBeenCalled();

    act(() => {
      renderer?.unmount();
    });
    renderer = null;
    harness.connect.mockClear();
    harness.wallets.length = 0;

    const gate = deferred<{
      wallet: unknown;
      accounts: Array<{ accountId: string }>;
    }>();
    harness.getConnectedWallet.mockImplementation(() => gate.promise);
    await mount(createElement(Probe));
    const during = apiRef.current!.getSigningWallet();
    const duringSettled = during.then(
      () => 'opened',
      (error: unknown) => error
    );
    await act(async () => {
      gate.reject(new Error('no wallet'));
      await duringSettled;
    });
    await expect(duringSettled).resolves.toMatchObject({
      message: expect.stringMatching(LOADING),
    });
    expect(harness.connect).not.toHaveBeenCalled();

    await waitForInit();
    const opened = apiRef.current!.getSigningWallet();
    const openedSettled = opened.then(
      () => 'opened' as const,
      () => 'rejected' as const
    );
    await expect
      .poll(() => harness.connect.mock.calls.length, {
        interval: 15,
        timeout: 2000,
      })
      .toBe(1);
    const openedState = await Promise.race([
      openedSettled,
      new Promise<'pending'>((resolve) => {
        setTimeout(() => resolve('pending'), 50);
      }),
    ]);
    expect(openedState).toBe('pending');
    expect(sessionSpy).not.toHaveBeenCalled();
    expect(signCallCount()).toBe(0);
    expect(collectText(renderer!.root)).not.toMatch(LOADING);
  });

  it('reuses one open picker and allows another after it is cancelled', async () => {
    await mount(createElement(Probe));
    await waitForInit();
    const picker = deferred<unknown>();
    harness.connect.mockImplementation(() => picker.promise);

    const first = apiRef.current!.getSigningWallet();
    const second = apiRef.current!.getSigningWallet();
    const firstSettled = first.then(
      () => 'opened',
      (error: unknown) => error
    );
    const secondSettled = second.then(
      () => 'opened',
      (error: unknown) => error
    );
    await expect
      .poll(() => harness.connect.mock.calls.length, {
        interval: 15,
        timeout: 2000,
      })
      .toBe(1);

    await act(async () => {
      picker.reject(new Error('user cancelled'));
      await Promise.all([firstSettled, secondSettled]);
    });
    await expect(firstSettled).resolves.toBeInstanceOf(Error);
    await expect(secondSettled).resolves.toBeInstanceOf(Error);

    const again = deferred<unknown>();
    harness.connect.mockImplementation(() => again.promise);
    const third = apiRef.current!.getSigningWallet();
    const thirdSettled = third.then(
      () => 'opened' as const,
      () => 'rejected' as const
    );
    await expect
      .poll(() => harness.connect.mock.calls.length, {
        interval: 15,
        timeout: 2000,
      })
      .toBe(2);
    const thirdState = await Promise.race([
      thirdSettled,
      new Promise<'pending'>((resolve) => {
        setTimeout(() => resolve('pending'), 50);
      }),
    ]);
    expect(thirdState).toBe('pending');
    expect(signCallCount()).toBe(0);
  });

  it('opens the buy sheet picker on the first tap without a loading toast', async () => {
    await mount(
      createElement(
        Shell,
        null,
        createElement(ScarceBuyForm, {
          formId: 'buy-scarce',
          listing: {
            status: 'listed',
            tokenId: 'lot-1',
            creatorId: 'seller.near',
            title: 'Field note',
            description: 'A note',
            mediaUrl: 'https://example.com/cover.png',
            priceNear: '1',
            sourcePostPath: 'seller.near/post/1',
          },
        })
      )
    );
    await waitForInit();
    await expectSignedOutPicker();
    expect(sessionSpy).not.toHaveBeenCalled();
    expect(signCallCount()).toBe(0);
  }, 12000);

  it('opens the collection mint sheet picker on the first tap without a loading toast', async () => {
    await mount(
      createElement(
        Shell,
        null,
        createElement(ScarceBuySheet, {
          open: true,
          onOpenChange: () => {},
          listing: {
            status: 'drop',
            collectionId: 'drop-field',
            creatorId: 'maker.near',
            title: 'Field drop',
            description: 'A drop',
            mediaUrl: 'https://example.com/cover.png',
            priceNear: '1',
            sourcePostPath: 'maker.near/post/1',
          },
        })
      )
    );
    await waitForInit();
    await expectSignedOutPicker();
    expect(collectText(renderer!.root)).toMatch(/Connect/);
    expect(sessionSpy).not.toHaveBeenCalled();
    expect(signCallCount()).toBe(0);
  }, 12000);

  it('opens a picker from bid, transfer, a hub sheet, and open-my-page without signing', async () => {
    await mount(
      createElement(
        Shell,
        null,
        createElement(ScarceBidForm, {
          formId: 'bid-scarce',
          listing: {
            tokenId: 'lot-1',
            sellerId: 'seller.near',
            title: 'Field note',
            description: 'A note',
            mediaUrl: 'https://example.com/cover.png',
            sourcePostPath: 'seller.near/post/1',
          },
        })
      )
    );
    await waitForInit();
    await expect
      .poll(() => collectText(renderer!.root), { interval: 20, timeout: 2000 })
      .toMatch(/Connect/);
    await act(async () => {
      findForm(renderer!.root).props.onSubmit({ preventDefault() {} });
    });
    await expect
      .poll(() => harness.connect.mock.calls.length, {
        interval: 20,
        timeout: 4000,
      })
      .toBe(1);
    expect(LOADING.test(collectText(renderer!.root))).toBe(false);
    expect(signCallCount()).toBe(0);

    act(() => {
      renderer?.unmount();
    });
    renderer = null;
    harness.connect.mockClear();

    const item: OwnedScarceItem = {
      tokenId: 'lot-1',
      title: 'Field note',
      ownerId: 'owner.testnet',
      listingKind: null,
    };
    await mount(
      createElement(
        Shell,
        null,
        createElement(ScarceTransferForm, {
          formId: 'transfer-scarce',
          item,
        })
      )
    );
    await waitForInit();
    await act(async () => {
      renderer!.root
        .findByType(NearAccountField)
        .props.onValueChange('friend.testnet');
    });
    await expect
      .poll(() => renderer!.root.findByType(NearAccountField).props.status, {
        interval: 30,
        timeout: 2000,
      })
      .toBe('found');
    await act(async () => {
      findForm(renderer!.root).props.onSubmit({ preventDefault() {} });
    });
    await expect
      .poll(() => harness.connect.mock.calls.length, {
        interval: 20,
        timeout: 4000,
      })
      .toBe(1);
    expect(LOADING.test(collectText(renderer!.root))).toBe(false);
    expect(signCallCount()).toBe(0);

    act(() => {
      renderer?.unmount();
    });
    renderer = null;
    harness.connect.mockClear();

    await mount(
      createElement(
        Shell,
        null,
        createElement(HubPublishRequestsSheet, {
          open: true,
          appId: 'field-hub',
          onClose: () => {},
          onChanged: () => {},
        })
      )
    );
    await waitForInit();
    await expect
      .poll(
        () =>
          renderer!.root.findAll(
            (node) =>
              node.type === 'button' && collectText(node).includes('Approve')
          ).length,
        { interval: 20, timeout: 2000 }
      )
      .toBeGreaterThan(0);
    const approve = renderer!.root.findAll(
      (node) => node.type === 'button' && collectText(node).includes('Approve')
    )[0]!;
    await act(async () => {
      approve.props.onClick();
    });
    await expect
      .poll(() => harness.connect.mock.calls.length, {
        interval: 20,
        timeout: 4000,
      })
      .toBe(1);
    expect(LOADING.test(collectText(renderer!.root))).toBe(false);
    expect(signCallCount()).toBe(0);
    expect(sessionSpy).not.toHaveBeenCalled();

    act(() => {
      renderer?.unmount();
    });
    renderer = null;
    harness.connect.mockClear();

    function OpenPage() {
      const { navigate } = useOsAppNavigate();
      return createElement(
        'button',
        {
          type: 'button',
          onClick: () => {
            navigate({ id: 'page', label: 'Page', kind: 'open-page' });
          },
        },
        'Open page'
      );
    }
    await mount(createElement(Shell, null, createElement(OpenPage)));
    await waitForInit();
    const openPage = renderer!.root.findAll(
      (node) =>
        node.type === 'button' && collectText(node).includes('Open page')
    )[0]!;
    await act(async () => {
      openPage.props.onClick();
    });
    await expect
      .poll(() => harness.connect.mock.calls.length, {
        interval: 20,
        timeout: 2000,
      })
      .toBe(1);
    expect(router.push).not.toHaveBeenCalled();
    expect(signCallCount()).toBe(0);
    expect(sessionSpy).not.toHaveBeenCalled();
  }, 20000);

  it('still runs session setup from dock connect', async () => {
    const wallet = makeWallet('visitor.near');
    harness.connect.mockResolvedValue(wallet);
    await mount(createElement(OsDockAccountZone));
    await expect
      .poll(
        () =>
          renderer!.root.findAll(
            (node) =>
              node.type === 'button' && node.props['aria-label'] === 'Connect'
          ).length,
        { interval: 15, timeout: 2000 }
      )
      .toBe(1);
    const button = renderer!.root.findAll(
      (node) => node.type === 'button' && node.props['aria-label'] === 'Connect'
    )[0]!;
    await act(async () => {
      button.props.onClick();
    });
    await expect
      .poll(() => sessionSpy?.mock.calls.length ?? 0, {
        interval: 15,
        timeout: 2000,
      })
      .toBe(1);
    expect(sessionSpy?.mock.calls[0]?.[0]).toBe('visitor.near');
    expect(signCallCount()).toBe(0);
  });

  it('releases a hung picker so the next request can open one', async () => {
    await mount(createElement(Probe));
    await waitForInit();
    const hung = deferred<{
      getAccounts: () => Promise<Array<{ accountId: string }>>;
    }>();
    harness.connect.mockImplementation(() => hung.promise);
    vi.useFakeTimers();
    try {
      let failure: unknown = null;
      void apiRef.current!.getSigningWallet().then(
        () => undefined,
        (error) => {
          failure = error;
        }
      );
      await vi.advanceTimersByTimeAsync(120_000);
      await act(async () => {
        await Promise.resolve();
      });
      expect(failure).toMatchObject({
        message: expect.stringMatching(/too long/),
      });
      vi.useRealTimers();
      const next = deferred<ReturnType<typeof makeWallet>>();
      harness.connect.mockImplementation(() => next.promise);
      const again = apiRef.current!.getSigningWallet();
      await expect
        .poll(() => harness.connect.mock.calls.length, {
          interval: 15,
          timeout: 2000,
        })
        .toBe(2);
      hung.resolve(makeWallet('carol.near'));
      await act(async () => {
        await Promise.resolve();
      });
      expect(apiRef.current?.accountId ?? null).toBeNull();
      next.resolve(makeWallet('dana.near'));
      await expect(again).resolves.toMatchObject({ accountId: 'dana.near' });
      await expect
        .poll(() => apiRef.current?.accountId, { interval: 15, timeout: 2000 })
        .toBe('dana.near');
    } finally {
      vi.useRealTimers();
    }
  });

  it('uses the account from the sign-in, not a stored preference on the same wallet', async () => {
    await mount(createElement(Probe));
    await waitForInit();
    await act(async () => {
      window.localStorage.setItem(APP_WALLET_ACCOUNT_KEY, 'alice.near');
      window.dispatchEvent(new Event('onsocial:wallet-account'));
    });
    harness.connect.mockImplementation(async () => {
      const wallet = {
        getAccounts: async () => [
          { accountId: 'alice.near' },
          { accountId: 'bob.near' },
        ],
        signAndSendTransaction: vi.fn(async () => {
          throw new Error('signing was not part of this test');
        }),
        signAndSendTransactions: vi.fn(),
        signMessage: vi.fn(),
      };
      harness.emitSignIn([{ accountId: 'bob.near' }], wallet);
      return wallet;
    });
    await expect(apiRef.current!.getSigningWallet()).rejects.toMatchObject({
      name: 'WalletConnectedReviewError',
      accountId: 'bob.near',
    });
    await expect
      .poll(() => apiRef.current?.accountId, { interval: 15, timeout: 2000 })
      .toBe('bob.near');
    expect(sessionSpy).not.toHaveBeenCalled();
  });

  it('does not let a newer attempt keep a stale sign-in', async () => {
    await mount(createElement(Probe));
    await waitForInit();
    const alice = signingWallet('alice.near');
    const bob = signingWallet('bob.near');
    const first = deferred<ReturnType<typeof makeWallet>>();
    let calls = 0;
    harness.connect.mockImplementation(() => {
      calls += 1;
      if (calls === 1) return first.promise;
      harness.emitSignIn([{ accountId: 'alice.near' }], alice);
      return Promise.resolve(bob);
    });
    const lead = apiRef.current!.getSigningWallet();
    await expect
      .poll(() => harness.connect.mock.calls.length, {
        interval: 15,
        timeout: 2000,
      })
      .toBe(1);
    await act(async () => {
      window.localStorage.setItem(APP_WALLET_ACCOUNT_KEY, 'bob.near');
      window.dispatchEvent(new Event('onsocial:wallet-account'));
    });
    const next = apiRef.current!.getSigningWallet();
    first.resolve(alice);
    await expect(lead).resolves.toMatchObject({ accountId: 'alice.near' });
    await expect(next).resolves.toMatchObject({ accountId: 'bob.near' });
    await expect
      .poll(() => apiRef.current?.accountId, { interval: 15, timeout: 2000 })
      .toBe('bob.near');
    act(() => {
      harness.emitSignIn([{ accountId: 'alice.near' }], alice);
    });
    expect(apiRef.current?.accountId).toBe('bob.near');
  });

  it('lets dock connect share the open picker and still run session setup', async () => {
    await mount(createElement(Shell, null, createElement(OsDockAccountZone)));
    await waitForInit();
    const picker = deferred<ReturnType<typeof makeWallet>>();
    harness.connect.mockImplementation(() => picker.promise);
    const signing = apiRef.current!.getSigningWallet();
    await expect
      .poll(() => harness.connect.mock.calls.length, {
        interval: 15,
        timeout: 2000,
      })
      .toBe(1);
    const button = renderer!.root.findAll(
      (node) => node.type === 'button' && node.props['aria-label'] === 'Connect'
    )[0]!;
    await act(async () => {
      button.props.onClick();
    });
    expect(harness.connect.mock.calls.length).toBe(1);
    picker.resolve(makeWallet('visitor.near'));
    await expect(signing).resolves.toMatchObject({ accountId: 'visitor.near' });
    await expect
      .poll(() => sessionSpy?.mock.calls.length ?? 0, {
        interval: 15,
        timeout: 2000,
      })
      .toBe(1);
    expect(signCallCount()).toBe(0);
  });

  it('does not hand a new account the previous picker result', async () => {
    await mount(createElement(Probe));
    await waitForInit();
    const firstPicker = deferred<ReturnType<typeof makeWallet>>();
    const secondPicker = deferred<ReturnType<typeof makeWallet>>();
    const pickers = [firstPicker, secondPicker];
    let call = 0;
    harness.connect.mockImplementation(() => pickers[call++]!.promise);
    const first = apiRef.current!.getSigningWallet();
    await expect
      .poll(() => harness.connect.mock.calls.length, {
        interval: 15,
        timeout: 2000,
      })
      .toBe(1);
    await act(async () => {
      window.localStorage.setItem(APP_WALLET_ACCOUNT_KEY, 'bob.near');
      window.dispatchEvent(new Event('onsocial:wallet-account'));
    });
    const second = apiRef.current!.getSigningWallet();
    firstPicker.resolve(makeWallet('alice.near'));
    await expect(first).resolves.toMatchObject({ accountId: 'alice.near' });
    await expect
      .poll(() => harness.connect.mock.calls.length, {
        interval: 15,
        timeout: 2000,
      })
      .toBe(2);
    secondPicker.resolve(makeWallet('bob.near'));
    await expect(second).resolves.toMatchObject({ accountId: 'bob.near' });
  });

  it('returns to the buy sheet after the picker so a payer confirms on the second tap', async () => {
    reviewRpc.balances.set('payer.near', PAYER_BALANCE_YOCTO);
    const footer = {
      current: null as { primaryLabel?: string; canSubmit?: boolean } | null,
    };
    await mountPaidBuy('seller.near', footer);
    const wallet = await resolveSignedOutPicker('payer.near');

    await expect
      .poll(() => reviewRpc.prepareCalls, { interval: 20, timeout: 2000 })
      .toBe(0);
    expect(signCallCount()).toBe(0);
    expect(findForm(renderer!.root)).toBeTruthy();
    expect(collectText(renderer!.root)).not.toMatch(LOADING);
    expect(collectText(renderer!.root)).not.toContain(OWN_LISTING_ERROR);
    await expect
      .poll(() => reviewRpc.viewedAccounts.includes('payer.near'), {
        interval: 20,
        timeout: 2000,
      })
      .toBe(true);
    await expect
      .poll(() => footer.current?.primaryLabel, { interval: 20, timeout: 2000 })
      .toBe('Buy · 1 NEAR');
    expect(footer.current?.canSubmit).toBe(true);
    expect(apiRef.current?.accountId).toBe('payer.near');
    const priceChecks = saleReads();

    await act(async () => {
      findForm(renderer!.root).props.onSubmit({ preventDefault() {} });
    });
    await expect
      .poll(() => signCallCount(), { interval: 20, timeout: 2000 })
      .toBe(1);
    expect(saleReads()).toBeGreaterThan(priceChecks);
    expect(depositOf(wallet)).toBe(ONE_NEAR_YOCTO);
    expect(reviewRpc.prepareCalls).toBe(1);
    expect(sessionSpy).not.toHaveBeenCalled();
  }, 12000);

  it('returns to the buy sheet after the picker when the account is the seller', async () => {
    const footer = { current: null as { primaryLabel?: string } | null };
    await mountPaidBuy('seller.near', footer);
    await resolveSignedOutPicker('seller.near');

    await expect
      .poll(() => reviewRpc.prepareCalls, { interval: 20, timeout: 2000 })
      .toBe(0);
    expect(signCallCount()).toBe(0);
    expect(findForm(renderer!.root)).toBeTruthy();
    await expect
      .poll(() => footer.current?.primaryLabel, { interval: 20, timeout: 2000 })
      .toBe('Delist');

    await act(async () => {
      findForm(renderer!.root).props.onSubmit({ preventDefault() {} });
    });
    await expect
      .poll(() => collectText(renderer!.root), { interval: 20, timeout: 2000 })
      .toContain(OWN_LISTING_ERROR);
    expect(signCallCount()).toBe(0);
    expect(reviewRpc.prepareCalls).toBe(0);
    expect(sessionSpy).not.toHaveBeenCalled();
  }, 12000);

  it('returns the wallet after the picker when review is not requested', async () => {
    await mount(createElement(Probe));
    await waitForInit();
    const picker = deferred<ReturnType<typeof makeWallet>>();
    harness.connect.mockImplementation(() => picker.promise);
    const pending = apiRef.current!.getSigningWallet();
    await expect
      .poll(() => harness.connect.mock.calls.length, {
        interval: 15,
        timeout: 2000,
      })
      .toBe(1);
    picker.resolve(signingWallet('payer.near'));
    await expect(pending).resolves.toMatchObject({ accountId: 'payer.near' });
    expect(collectText(renderer!.root)).not.toContain(REVIEW_TEXT);
  });

  it('throws when the picked account is not the preferred account', async () => {
    await mount(createElement(Probe));
    await waitForInit();
    await act(async () => {
      window.localStorage.setItem(APP_WALLET_ACCOUNT_KEY, 'alice.near');
      window.dispatchEvent(new Event('onsocial:wallet-account'));
    });
    const picker = deferred<ReturnType<typeof makeWallet>>();
    harness.connect.mockImplementation(() => picker.promise);
    const pending = apiRef.current!.getSigningWallet();
    await expect
      .poll(() => harness.connect.mock.calls.length, {
        interval: 15,
        timeout: 2000,
      })
      .toBe(1);
    picker.resolve(signingWallet('bob.near'));
    await expect(pending).rejects.toMatchObject({
      name: 'WalletConnectedReviewError',
      accountId: 'bob.near',
    });
    await expect
      .poll(() => apiRef.current?.accountId, { interval: 15, timeout: 2000 })
      .toBe('bob.near');

    const again = deferred<ReturnType<typeof makeWallet>>();
    harness.connect.mockImplementation(() => again.promise);
    harness.getConnectedWallet.mockRejectedValue(new Error('no wallet'));
    await act(async () => {
      window.localStorage.setItem(APP_WALLET_ACCOUNT_KEY, 'bob.near');
      window.dispatchEvent(new Event('onsocial:wallet-account'));
    });
    const matched = apiRef.current!.getSigningWallet();
    await expect
      .poll(() => harness.connect.mock.calls.length, {
        interval: 15,
        timeout: 2000,
      })
      .toBe(2);
    again.resolve(signingWallet('bob.near'));
    await expect(matched).resolves.toMatchObject({ accountId: 'bob.near' });
  });

  it('opens one bid picker then signs without review text', async () => {
    await mount(
      createElement(
        Shell,
        null,
        createElement(ScarceBidForm, {
          formId: 'bid-scarce',
          listing: {
            tokenId: 'lot-1',
            sellerId: 'seller.near',
            title: 'Field note',
            description: 'A note',
            mediaUrl: 'https://example.com/cover.png',
            sourcePostPath: 'seller.near/post/1',
          },
        })
      )
    );
    await waitForInit();
    const picker = deferred<ReturnType<typeof makeWallet>>();
    harness.connect.mockImplementation(() => picker.promise);
    await expect
      .poll(() => collectText(renderer!.root), { interval: 20, timeout: 2000 })
      .toMatch(/Connect/);
    await act(async () => {
      findForm(renderer!.root).props.onSubmit({ preventDefault() {} });
    });
    await expect
      .poll(() => harness.connect.mock.calls.length, {
        interval: 20,
        timeout: 4000,
      })
      .toBe(1);
    const wallet = signingWallet('payer.near');
    await act(async () => {
      harness.getConnectedWallet.mockResolvedValue({
        wallet,
        accounts: [{ accountId: 'payer.near' }],
      });
      picker.resolve(wallet);
    });
    await expect
      .poll(() => signCallCount(), { interval: 20, timeout: 2000 })
      .toBe(1);
    expect(collectText(renderer!.root)).not.toContain(REVIEW_TEXT);
    expect(harness.connect.mock.calls.length).toBe(1);
  }, 12000);

  it('navigates after the picker', async () => {
    function OpenPage() {
      const { navigate } = useOsAppNavigate();
      return createElement(
        'button',
        {
          type: 'button',
          onClick: () => {
            navigate({ id: 'page', label: 'Page', kind: 'open-page' });
          },
        },
        'Open page'
      );
    }
    await mount(createElement(Shell, null, createElement(OpenPage)));
    await waitForInit();
    const picker = deferred<ReturnType<typeof makeWallet>>();
    harness.connect.mockImplementation(() => picker.promise);
    const openPage = renderer!.root.findAll(
      (node) =>
        node.type === 'button' && collectText(node).includes('Open page')
    )[0]!;
    await act(async () => {
      openPage.props.onClick();
    });
    await expect
      .poll(() => harness.connect.mock.calls.length, {
        interval: 15,
        timeout: 2000,
      })
      .toBe(1);
    await act(async () => {
      picker.resolve(signingWallet('payer.near'));
    });
    await expect
      .poll(() => router.push.mock.calls.length, {
        interval: 15,
        timeout: 2000,
      })
      .toBe(1);
    expect(router.push.mock.calls[0]?.[0]).toBe('/@payer.near');
    expect(collectText(renderer!.root)).not.toContain(REVIEW_TEXT);
  });

  it('opens the picked account page on a mismatch', async () => {
    const logged: string[] = [];
    const errorSpy = vi
      .spyOn(console, 'error')
      .mockImplementation((...args) => {
        logged.push(args.map(String).join(' '));
      });
    try {
      function OpenPage() {
        const { navigate } = useOsAppNavigate();
        return createElement(
          'button',
          {
            type: 'button',
            onClick: () => {
              navigate({ id: 'page', label: 'Page', kind: 'open-page' });
            },
          },
          'Open page'
        );
      }
      await mount(createElement(Shell, null, createElement(OpenPage)));
      await waitForInit();
      await act(async () => {
        window.localStorage.setItem(APP_WALLET_ACCOUNT_KEY, 'alice.near');
        window.dispatchEvent(new Event('onsocial:wallet-account'));
      });
      const picker = deferred<ReturnType<typeof makeWallet>>();
      harness.connect.mockImplementation(() => picker.promise);
      const openPage = renderer!.root.findAll(
        (node) =>
          node.type === 'button' && collectText(node).includes('Open page')
      )[0]!;
      await act(async () => {
        openPage.props.onClick();
      });
      await expect
        .poll(() => harness.connect.mock.calls.length, {
          interval: 15,
          timeout: 2000,
        })
        .toBe(1);
      await act(async () => {
        picker.resolve(signingWallet('payer.near'));
      });
      await expect
        .poll(() => router.push.mock.calls.length, {
          interval: 15,
          timeout: 2000,
        })
        .toBe(1);
      expect(router.push.mock.calls[0]?.[0]).toBe('/@payer.near');
      expect(logged.join('\n')).not.toContain('Could not open your page');
      expect(collectText(renderer!.root)).not.toContain('Review this account');
    } finally {
      errorSpy.mockRestore();
    }
  });

  it('keeps one connect when three keys overlap', async () => {
    await mount(createElement(Probe));
    await waitForInit();
    const first = deferred<ReturnType<typeof makeWallet>>();
    const second = deferred<ReturnType<typeof makeWallet>>();
    const pickers = [first, second];
    let call = 0;
    harness.connect.mockImplementation(() => pickers[call++]!.promise);
    const lead = apiRef.current!.getSigningWallet();
    await expect
      .poll(() => harness.connect.mock.calls.length, {
        interval: 15,
        timeout: 2000,
      })
      .toBe(1);
    await act(async () => {
      window.localStorage.setItem(APP_WALLET_ACCOUNT_KEY, 'bob.near');
      window.dispatchEvent(new Event('onsocial:wallet-account'));
    });
    const bob = apiRef.current!.getSigningWallet();
    await act(async () => {
      window.localStorage.setItem(APP_WALLET_ACCOUNT_KEY, 'carol.near');
      window.dispatchEvent(new Event('onsocial:wallet-account'));
    });
    const carol = apiRef.current!.getSigningWallet();
    await act(async () => {
      await Promise.resolve();
    });
    expect(harness.connect.mock.calls.length).toBe(1);
    first.resolve(signingWallet('alice.near'));
    await expect(lead).resolves.toMatchObject({ accountId: 'alice.near' });
    await expect
      .poll(() => harness.connect.mock.calls.length, {
        interval: 15,
        timeout: 2000,
      })
      .toBe(2);
    expect(harness.connect.mock.calls.length).toBe(2);
    void bob;
    void carol;
  });

  it('ignores a late sign-in when a newer attempt exists', async () => {
    await mount(createElement(Probe));
    await waitForInit();
    const hung = deferred<ReturnType<typeof makeWallet>>();
    harness.connect.mockImplementation(() => hung.promise);
    vi.useFakeTimers();
    try {
      const first = apiRef.current!.getSigningWallet();
      const firstSettled = first.then(
        () => 'opened',
        () => 'rejected'
      );
      await vi.advanceTimersByTimeAsync(120_000);
      await act(async () => {
        await Promise.resolve();
      });
      vi.useRealTimers();
      const next = deferred<ReturnType<typeof makeWallet>>();
      harness.connect.mockImplementation(() => next.promise);
      const again = apiRef.current!.getSigningWallet();
      await expect
        .poll(() => harness.connect.mock.calls.length, {
          interval: 15,
          timeout: 2000,
        })
        .toBe(2);
      hung.resolve(signingWallet('carol.near'));
      await act(async () => {
        await Promise.resolve();
      });
      expect(apiRef.current?.accountId ?? null).not.toBe('carol.near');
      next.resolve(signingWallet('dana.near'));
      await expect(again).resolves.toMatchObject({ accountId: 'dana.near' });
      await expect(firstSettled).resolves.toBe('rejected');
    } finally {
      vi.useRealTimers();
    }
  });

  it('accepts a late sign-in when no newer attempt exists', async () => {
    await mount(createElement(Probe));
    await waitForInit();
    const hung = deferred<ReturnType<typeof makeWallet>>();
    harness.connect.mockImplementation(() => hung.promise);
    vi.useFakeTimers();
    try {
      const pending = apiRef.current!.getSigningWallet();
      const settled = pending.then(
        () => 'opened',
        (error: unknown) => error
      );
      await vi.advanceTimersByTimeAsync(120_000);
      await act(async () => {
        await Promise.resolve();
      });
      await expect(settled).resolves.toMatchObject({
        message: expect.stringMatching(/too long/),
      });
      await expect
        .poll(() => collectText(renderer!.root), {
          interval: 15,
          timeout: 2000,
        })
        .toMatch(/too long/);
      vi.useRealTimers();
      hung.resolve(signingWallet('carol.near'));
      await expect
        .poll(() => apiRef.current?.accountId, { interval: 15, timeout: 2000 })
        .toBe('carol.near');
      expect(collectText(renderer!.root)).not.toMatch(/too long/);
    } finally {
      vi.useRealTimers();
    }
  });

  it('does not open a picker when a drop poll has no account', async () => {
    await mount(createElement(Shell, null, createElement(CreateDropPanel)));
    await waitForInit();
    const variations = renderer!.root.findAll(
      (node) =>
        node.type === 'button' &&
        collectText(node).includes('Set of variations')
    )[0]!;
    await act(async () => {
      variations.props.onClick();
    });
    const generate = renderer!.root.findAll(
      (node) =>
        node.type === 'button' && collectText(node).includes('Generate layers')
    )[0]!;
    await act(async () => {
      generate.props.onClick();
    });
    const builder = renderer!.root.findByType(GenerativeDropBuilder);
    await act(async () => {
      builder.props.onJobStarted('job-keep');
    });
    const callsBefore = harness.connect.mock.calls.length;
    let pausedId: string | null = null;
    const poll = builder.props.remotePoll('job-keep');
    const settled = poll.then(
      () => 'resolved',
      (error: { jobId?: string }) => {
        pausedId = error?.jobId ?? null;
        return 'paused';
      }
    );
    await expect
      .poll(() => harness.connect.mock.calls.length, {
        interval: 20,
        timeout: 500,
      })
      .toBe(callsBefore);
    await expect(settled).resolves.toBe('paused');
    expect(pausedId).toBe('job-keep');
    expect(renderer!.root.findByType(GenerativeDropBuilder)).toBeTruthy();
  }, 15000);

  it('accept offer and list do not sign on the first tap', async () => {
    vi.spyOn(scarceOffers, 'fetchOffersForToken').mockResolvedValue([
      {
        buyerId: 'buyer.near',
        amountYocto: ONE_NEAR_YOCTO,
        amountNear: '1',
        expiresAtNs: null,
        createdAtNs: 1,
      },
    ]);
    await mount(
      createElement(
        Shell,
        null,
        createElement(ScarceOffersSheet, {
          open: true,
          item: {
            tokenId: 'lot-1',
            title: 'Field note',
            ownerId: 'seller.near',
            listingKind: null,
          },
          onOpenChange: () => {},
        })
      )
    );
    await waitForInit();
    await expect
      .poll(
        () =>
          renderer!.root.findAll(
            (node) =>
              node.type === 'button' && collectText(node).includes('Connect')
          ).length,
        { interval: 20, timeout: 2000 }
      )
      .toBeGreaterThan(0);
    const picker = deferred<ReturnType<typeof makeWallet>>();
    harness.connect.mockImplementation(() => picker.promise);
    const connect = renderer!.root.findAll(
      (node) => node.type === 'button' && collectText(node).trim() === 'Connect'
    )[0]!;
    await act(async () => {
      connect.props.onClick();
    });
    await expect
      .poll(() => harness.connect.mock.calls.length, {
        interval: 15,
        timeout: 2000,
      })
      .toBe(1);
    await act(async () => {
      picker.resolve(signingWallet('payer.near'));
    });
    await act(async () => {
      await Promise.resolve();
    });
    expect(signCallCount()).toBe(0);
    expect(collectText(renderer!.root)).not.toContain(REVIEW_TEXT);

    act(() => {
      renderer?.unmount();
    });
    renderer = null;
    harness.connect.mockClear();
    harness.connect.mockImplementation(() => new Promise(() => {}));

    await mount(
      createElement(
        Shell,
        null,
        createElement(ScarceListForm, {
          formId: 'list-scarce',
          post: {
            accountId: 'author.near',
            postId: '1',
            value: '',
          },
        })
      )
    );
    await waitForInit();
    const listPicker = deferred<ReturnType<typeof makeWallet>>();
    harness.connect.mockImplementation(() => listPicker.promise);
    await act(async () => {
      findForm(renderer!.root).props.onSubmit({ preventDefault() {} });
    });
    await expect
      .poll(() => harness.connect.mock.calls.length, {
        interval: 15,
        timeout: 2000,
      })
      .toBe(1);
    await act(async () => {
      listPicker.resolve(signingWallet('payer.near'));
    });
    await act(async () => {
      await Promise.resolve();
    });
    expect(signCallCount()).toBe(0);
    expect(collectText(renderer!.root)).not.toContain(REVIEW_TEXT);
  }, 15000);

  it('does not show an error toast when the picked account mismatches', async () => {
    function MismatchCaller() {
      const { getSigningWallet } = useAppWallet();
      const { setTxResult } = useAppTransactionFeedback();
      return createElement(
        'button',
        {
          type: 'button',
          onClick: () => {
            void getSigningWallet().catch((err: unknown) => {
              if (isWalletUserCancellation(err)) return;
              if (
                err instanceof Error &&
                err.name === 'WalletConnectedReviewError'
              ) {
                return;
              }
              setTxResult({
                type: 'error',
                msg: err instanceof Error ? err.message : 'failed',
              });
            });
          },
        },
        'Sign'
      );
    }
    await mount(createElement(Shell, null, createElement(MismatchCaller)));
    await waitForInit();
    await act(async () => {
      window.localStorage.setItem(APP_WALLET_ACCOUNT_KEY, 'alice.near');
      window.dispatchEvent(new Event('onsocial:wallet-account'));
    });
    const picker = deferred<ReturnType<typeof makeWallet>>();
    harness.connect.mockImplementation(() => picker.promise);
    const sign = renderer!.root.findAll(
      (node) => node.type === 'button' && collectText(node).trim() === 'Sign'
    )[0]!;
    await act(async () => {
      sign.props.onClick();
    });
    await expect
      .poll(() => harness.connect.mock.calls.length, {
        interval: 15,
        timeout: 2000,
      })
      .toBe(1);
    await act(async () => {
      picker.resolve(signingWallet('bob.near'));
    });
    await act(async () => {
      await Promise.resolve();
    });
    const text = collectText(renderer!.root);
    expect(text).not.toContain('Review this account');
    expect(text).not.toContain(REVIEW_TEXT);
  });

  it('shows the timeout once', async () => {
    function TimeoutCaller() {
      const { getSigningWallet } = useAppWallet();
      const { setTxResult } = useAppTransactionFeedback();
      return createElement(
        'button',
        {
          type: 'button',
          onClick: () => {
            void getSigningWallet().catch((err: unknown) => {
              if (isWalletUserCancellation(err)) return;
              setTxResult({
                type: 'error',
                msg: err instanceof Error ? err.message : 'failed',
              });
            });
          },
        },
        'Sign'
      );
    }
    await mount(createElement(Shell, null, createElement(TimeoutCaller)));
    await waitForInit();
    harness.connect.mockImplementation(() => new Promise(() => {}));
    vi.useFakeTimers();
    try {
      const sign = renderer!.root.findAll(
        (node) => node.type === 'button' && collectText(node).trim() === 'Sign'
      )[0]!;
      await act(async () => {
        sign.props.onClick();
      });
      await vi.advanceTimersByTimeAsync(120_000);
      await act(async () => {
        await Promise.resolve();
      });
      expect(collectText(renderer!.root)).toMatch(/too long/);
      await act(async () => {
        apiRef.current!.clearSessionFeedback();
      });
      expect(collectText(renderer!.root)).not.toMatch(/too long/);
    } finally {
      vi.useRealTimers();
    }
  });

  it('renders an info toast as neutral status and leaves the other types', async () => {
    const info = {
      type: 'info' as const,
      title: 'Now using @bob.near',
      msg: 'Tap Buy again to continue.',
    };
    function toast(result: {
      type: 'success' | 'error' | 'info';
      msg: string;
      title?: string;
    }) {
      return createElement(TransactionFeedbackToast, {
        result,
        onClose() {},
      });
    }
    function statusNode() {
      return renderer!.root.findAll((node) => node.props?.role === 'status')[0];
    }
    await act(async () => {
      renderer = create(toast({ type: 'success', msg: 'Saved.' }));
    });
    expect(statusNode().props.className).toContain('is-success');
    expect(collectText(renderer!.root)).toContain('Saved.');
    expect(
      renderer!.root.findAll(
        (node) =>
          typeof node.props?.className === 'string' &&
          node.props.className.includes('app-tx-toast-title')
      ).length
    ).toBe(0);
    await act(async () => {
      renderer = create(toast({ type: 'error', msg: 'Failed.' }));
    });
    expect(statusNode().props.className).toContain('is-error');
    await act(async () => {
      renderer = create(toast(info));
    });
    const status = statusNode();
    expect(status.props['aria-live']).toBe('polite');
    expect(status.props.className).toContain('is-info');
    expect(status.props.className).not.toContain('is-error');
    expect(status.props.className).not.toContain('is-success');
    expect(
      renderer!.root.findAll(
        (node) =>
          typeof node.props?.className === 'string' &&
          node.props.className.includes('app-tx-toast-icon--info')
      ).length
    ).toBeGreaterThan(0);
    expect(
      renderer!.root.findAll(
        (node) =>
          typeof node.props?.className === 'string' &&
          node.props.className.includes('app-tx-toast-icon--error')
      ).length
    ).toBe(0);
    const text = collectText(renderer!.root);
    expect(text).toContain(info.title);
    expect(text).toContain(info.msg);
    expect(
      renderer!.root.findAll(
        (node) =>
          typeof node.props?.className === 'string' &&
          node.props.className.includes('app-tx-toast-title')
      ).length
    ).toBeGreaterThan(0);
  });

  it('returns the create-token step thread to idle and shows the info toast', async () => {
    window.localStorage.setItem(
      APP_WALLET_ACCOUNT_KEY,
      'alice.onsocial.testnet'
    );
    await mount(
      createElement(
        Shell,
        null,
        createElement(AppCreateTokenSheet, { open: true, onClose() {} })
      )
    );
    await waitForInit();
    const name = renderer!.root.findByProps({ placeholder: 'Cool Token' });
    const symbol = renderer!.root.findByProps({ placeholder: 'COOL' });
    await act(async () => {
      name.props.onChange({ target: { value: 'Note' } });
      symbol.props.onChange({ target: { value: 'N' } });
    });
    await expect
      .poll(() => collectText(renderer!.root), { interval: 40, timeout: 4000 })
      .toContain('Available');
    const picker = deferred<ReturnType<typeof makeWallet>>();
    harness.connect.mockImplementation(() => picker.promise);
    await act(async () => {
      findForm(renderer!.root).props.onSubmit({ preventDefault() {} });
    });
    await expect
      .poll(() => harness.connect.mock.calls.length, {
        interval: 20,
        timeout: 3000,
      })
      .toBe(1);
    await act(async () => {
      picker.resolve(signingWallet('bob.onsocial.testnet'));
    });
    await act(async () => {
      await Promise.resolve();
    });
    const text = collectText(renderer!.root);
    expect(
      renderer!.root.findAll(
        (node) => node.props?.['aria-label'] === 'Sign in your wallet'
      ).length
    ).toBe(0);
    expect(text).toContain('Now using @bob.onsocial.testnet');
    expect(text).toContain('Tap Create again to continue.');
  }, 12000);

  it('keeps the timeout toast after a bundled dock connect', async () => {
    vi.spyOn(appSocialSession, 'resolveAppSessionPlan').mockResolvedValue({
      sessionReady: false,
      pendingSessionKey: {
        publicKey: 'ed25519:test',
        secretSeedB64u: 'c2VlZA',
        sign: async () => new Uint8Array(64),
      },
    });
    vi.spyOn(welcomeNear, 'accountNeedsAppSessionSponsor').mockResolvedValue(
      false
    );
    vi.spyOn(
      welcomeNear,
      'resolveAppSessionKeyAllowanceYocto'
    ).mockResolvedValue('250000000000000000000000');
    await mount(createElement(OsDockAccountZone));
    await expect
      .poll(
        () =>
          renderer!.root.findAll(
            (node) =>
              node.type === 'button' && node.props['aria-label'] === 'Connect'
          ).length,
        { interval: 15, timeout: 2000 }
      )
      .toBe(1);
    window.localStorage.setItem(APP_WALLET_ACCOUNT_KEY, 'alice.near');
    harness.connect.mockImplementation(() => new Promise(() => {}));
    vi.useFakeTimers();
    try {
      const button = renderer!.root.findAll(
        (node) =>
          node.type === 'button' && node.props['aria-label'] === 'Connect'
      )[0]!;
      await act(async () => {
        button.props.onClick();
      });
      await vi.advanceTimersByTimeAsync(120_000);
      await act(async () => {
        await Promise.resolve();
      });
      expect(collectText(renderer!.root)).toMatch(/too long/);
    } finally {
      vi.useRealTimers();
    }
  });

  it('does not apply a later approval of the same wallet object', async () => {
    await mount(createElement(Probe));
    await waitForInit();
    const wallet = signingWallet('bob.near');
    const hung = deferred<typeof wallet>();
    let calls = 0;
    harness.connect.mockImplementation(() => {
      calls += 1;
      if (calls === 1) return hung.promise;
      harness.emitSignIn([{ accountId: 'bob.near' }], wallet);
      return Promise.resolve(wallet);
    });
    vi.useFakeTimers();
    try {
      const first = apiRef.current!.getSigningWallet();
      const firstSettled = first.then(
        () => 'opened',
        () => 'rejected'
      );
      await vi.advanceTimersByTimeAsync(120_000);
      await act(async () => {
        await Promise.resolve();
      });
      vi.useRealTimers();
      const again = apiRef.current!.getSigningWallet();
      await expect(again).resolves.toMatchObject({ accountId: 'bob.near' });
      await expect
        .poll(() => apiRef.current?.accountId, { interval: 15, timeout: 2000 })
        .toBe('bob.near');
      await act(async () => {
        harness.emitSignIn([{ accountId: 'alice.near' }], wallet);
        await Promise.resolve();
      });
      expect(apiRef.current?.accountId).toBe('bob.near');
      await expect(firstSettled).resolves.toBe('rejected');
    } finally {
      vi.useRealTimers();
    }
  });

  it('throws a review error when the connected account is not the preferred account', async () => {
    await mount(createElement(Probe));
    await waitForInit();
    await act(async () => {
      window.localStorage.setItem(APP_WALLET_ACCOUNT_KEY, 'bob.near');
      window.dispatchEvent(new Event('onsocial:wallet-account'));
    });
    const wallet = signingWallet('alice.near');
    harness.getConnectedWallet.mockResolvedValue({
      wallet,
      accounts: [{ accountId: 'alice.near' }],
    });
    await expect(apiRef.current!.getSigningWallet()).rejects.toMatchObject({
      name: 'WalletConnectedReviewError',
      accountId: 'alice.near',
    });
  });

  it('shows an info toast when buy, list, or accept-offer mismatches', async () => {
    const title = 'Now using @bob.near';
    const footer = { current: null };
    await mountPaidBuy('seller.near', footer);
    window.localStorage.setItem(APP_WALLET_ACCOUNT_KEY, 'alice.near');
    const buyPicker = deferred<ReturnType<typeof makeWallet>>();
    harness.connect.mockImplementation(() => buyPicker.promise);
    await act(async () => {
      findForm(renderer!.root).props.onSubmit({ preventDefault() {} });
    });
    await expect
      .poll(() => harness.connect.mock.calls.length, {
        interval: 20,
        timeout: 3000,
      })
      .toBe(1);
    await act(async () => {
      buyPicker.resolve(signingWallet('bob.near'));
    });
    await expect
      .poll(() => collectText(renderer!.root), { interval: 20, timeout: 3000 })
      .toContain(title);
    expect(collectText(renderer!.root)).toContain(
      'Tap Buy · 1 NEAR again to continue.'
    );
    expect(signCallCount()).toBe(0);

    act(() => {
      renderer?.unmount();
    });
    renderer = null;
    harness.connect.mockClear();
    harness.connect.mockImplementation(() => new Promise(() => {}));

    await mount(
      createElement(
        Shell,
        null,
        createElement(ScarceListForm, {
          formId: 'list-scarce',
          post: { accountId: 'author.near', postId: '1', value: '' },
        })
      )
    );
    await waitForInit();
    const listPicker = deferred<ReturnType<typeof makeWallet>>();
    harness.connect.mockImplementation(() => listPicker.promise);
    await act(async () => {
      findForm(renderer!.root).props.onSubmit({ preventDefault() {} });
    });
    await expect
      .poll(() => harness.connect.mock.calls.length, {
        interval: 20,
        timeout: 3000,
      })
      .toBe(1);
    await act(async () => {
      listPicker.resolve(signingWallet('bob.near'));
    });
    await expect
      .poll(() => collectText(renderer!.root), { interval: 20, timeout: 3000 })
      .toContain(title);
    expect(collectText(renderer!.root)).toContain(
      'Tap Create Drop again to continue.'
    );

    act(() => {
      renderer?.unmount();
    });
    renderer = null;
    harness.connect.mockClear();
    harness.connect.mockImplementation(() => new Promise(() => {}));
    window.localStorage.removeItem(APP_WALLET_ACCOUNT_KEY);
    vi.spyOn(scarceOffers, 'fetchOffersForToken').mockResolvedValue([
      {
        buyerId: 'buyer.near',
        amountYocto: ONE_NEAR_YOCTO,
        amountNear: '1',
        expiresAtNs: null,
        createdAtNs: 1,
      },
    ]);
    await mount(
      createElement(
        Shell,
        null,
        createElement(ScarceOffersSheet, {
          open: true,
          item: {
            tokenId: 'lot-1',
            title: 'Field note',
            ownerId: 'seller.near',
            listingKind: null,
          },
          onOpenChange: () => {},
        })
      )
    );
    await waitForInit();
    window.localStorage.setItem(APP_WALLET_ACCOUNT_KEY, 'alice.near');
    const offerPicker = deferred<ReturnType<typeof makeWallet>>();
    harness.connect.mockImplementation(() => offerPicker.promise);
    await expect
      .poll(
        () =>
          renderer!.root.findAll(
            (node) =>
              node.type === 'button' && collectText(node).trim() === 'Connect'
          ).length,
        { interval: 20, timeout: 3000 }
      )
      .toBeGreaterThan(0);
    const accept = renderer!.root.findAll(
      (node) => node.type === 'button' && collectText(node).trim() === 'Connect'
    )[0]!;
    await act(async () => {
      accept.props.onClick();
    });
    await expect
      .poll(() => harness.connect.mock.calls.length, {
        interval: 20,
        timeout: 3000,
      })
      .toBe(1);
    await act(async () => {
      offerPicker.resolve(signingWallet('bob.near'));
    });
    await expect
      .poll(() => collectText(renderer!.root), { interval: 20, timeout: 3000 })
      .toContain(title);
    expect(collectText(renderer!.root)).toContain(
      'Tap Accept · 1 NEAR again to continue.'
    );
    expect(signCallCount()).toBe(0);
  }, 20000);
});

const ALLOW_OPTIONS = {
  addFunctionCallKey: {
    contractId: 'core.onsocial.testnet',
    publicKey: 'ed25519:allow',
    allowMethods: { anyMethod: false, methodNames: ['execute'] },
    gasAllowance: { kind: 'limited', amount: '1' },
  },
};

async function mountConnectedAlice(child: ReactNode = null) {
  const wallet = signingWallet('alice.near');
  harness.getConnectedWallet.mockResolvedValue({
    wallet,
    accounts: [{ accountId: 'alice.near' }],
  });
  await mount(createElement(Shell, null, child));
  await expect
    .poll(() => apiRef.current?.accountId, { interval: 15, timeout: 2000 })
    .toBe('alice.near');
  await waitForInit();
  expect(window.localStorage.getItem(APP_WALLET_ACCOUNT_KEY)).toBe(
    'alice.near'
  );
  return wallet;
}

function signInAs(wallet: ReturnType<typeof makeWallet>, accountId: string) {
  harness.connect.mockImplementation(async () => {
    wallet.getAccounts.mockImplementation(async () => [{ accountId }]);
    harness.getConnectedWallet.mockResolvedValue({
      wallet,
      accounts: [{ accountId }],
    });
    harness.emitSignIn([{ accountId }], wallet);
    return wallet;
  });
}

function accountSnapshot() {
  return {
    account: apiRef.current?.accountId ?? null,
    stored: window.localStorage.getItem(APP_WALLET_ACCOUNT_KEY),
  };
}

function reviewNotice() {
  const text = collectText(renderer!.root);
  return {
    ...accountSnapshot(),
    review: text.includes('Review this account, then confirm.'),
    info: renderer!.root
      .findAll((node) => node.props?.role === 'status')
      .some(
        (node) =>
          typeof node.props.className === 'string' &&
          node.props.className.includes('is-info') &&
          !node.props.className.includes('is-error')
      ),
  };
}

describe('allow, renew, and session connect guard', () => {
  beforeEach(() => {
    installBrowser();
    harness.wallets.length = 0;
    harness.signInListeners.clear();
    harness.onSignInListeners.clear();
    harness.connect.mockReset();
    harness.connect.mockImplementation(() => new Promise(() => {}));
    harness.getConnectedWallet.mockReset();
    harness.getConnectedWallet.mockRejectedValue(new Error('no wallet'));
    apiRef.current = null;
    sessionSpy = vi
      .spyOn(appSocialSession, 'bootstrapAppSocialSession')
      .mockResolvedValue(false);
  });

  afterEach(() => {
    act(() => {
      renderer?.unmount();
    });
    renderer = null;
    sessionSpy?.mockRestore();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('keeps Allow on the account that is already connected', async () => {
    const wallet = await mountConnectedAlice();
    signInAs(wallet, 'alice.near');
    await expect(
      apiRef.current!.connectWithOptions(ALLOW_OPTIONS as never)
    ).resolves.toBe(wallet);
    expect(accountSnapshot()).toEqual({
      account: 'alice.near',
      stored: 'alice.near',
    });
    expect(harness.connect.mock.calls.at(-1)?.[0]).toEqual(ALLOW_OPTIONS);
  });

  it('throws when Allow signs in as a different account and keeps the app account', async () => {
    const wallet = await mountConnectedAlice();
    signInAs(wallet, 'bob.near');
    const complete = vi
      .spyOn(appSocialSession, 'completeAppSessionAfterConnect')
      .mockResolvedValue(undefined);
    await expect(
      apiRef.current!.connectWithOptions(ALLOW_OPTIONS as never)
    ).rejects.toMatchObject({
      name: 'WalletConnectedReviewError',
      accountId: 'bob.near',
    });
    await expect
      .poll(() => accountSnapshot(), { interval: 15, timeout: 500 })
      .toEqual({ account: 'alice.near', stored: 'alice.near' });
    expect(harness.connect.mock.calls.at(-1)?.[0]).toEqual(ALLOW_OPTIONS);
    expect(complete).not.toHaveBeenCalled();
  });

  it('throws when renew signs in as a different account and keeps the app account', async () => {
    const wallet = await mountConnectedAlice();
    signInAs(wallet, 'bob.near');
    vi.spyOn(appSocialSession, 'restoreAppSocialSession').mockResolvedValue(
      null
    );
    vi.spyOn(
      appSocialSession,
      'getAppSocialSessionLifecycle'
    ).mockResolvedValue('expired');
    let continued = false;
    vi.spyOn(appSocialSession, 'renewAppSocialSession').mockImplementation(
      async (input) => {
        await input.connectWithOptions(ALLOW_OPTIONS as never);
        continued = true;
        return true;
      }
    );
    await expect(apiRef.current!.resumeSocialSession()).rejects.toMatchObject({
      name: 'WalletConnectedReviewError',
      accountId: 'bob.near',
    });
    expect(continued).toBe(false);
    await expect
      .poll(() => accountSnapshot(), { interval: 15, timeout: 500 })
      .toEqual({ account: 'alice.near', stored: 'alice.near' });
  });

  it('settles a hung Allow sign-in at the picker timeout', async () => {
    await mountConnectedAlice();
    vi.useFakeTimers();
    try {
      let settled: unknown = 'pending';
      void apiRef.current!.connectWithOptions(ALLOW_OPTIONS as never).then(
        () => {
          settled = 'resolved';
        },
        (error: unknown) => {
          settled = error;
        }
      );
      await act(async () => {
        await Promise.resolve();
      });
      expect(harness.connect).toHaveBeenCalledWith(ALLOW_OPTIONS);
      await vi.advanceTimersByTimeAsync(119_000);
      await act(async () => {
        await Promise.resolve();
      });
      expect(settled).toBe('pending');
      await vi.advanceTimersByTimeAsync(1_000);
      await act(async () => {
        await Promise.resolve();
      });
      expect(settled).toMatchObject({ name: 'WalletPickerTimeoutError' });
      expect(accountSnapshot()).toEqual({
        account: 'alice.near',
        stored: 'alice.near',
      });
      expect(apiRef.current?.sessionFeedback?.msg).toMatch(/too long/);
    } finally {
      vi.useRealTimers();
    }
  });

  it('settles a hung renew sign-in at the picker timeout', async () => {
    await mountConnectedAlice();
    vi.spyOn(appSocialSession, 'restoreAppSocialSession').mockResolvedValue(
      null
    );
    vi.spyOn(
      appSocialSession,
      'getAppSocialSessionLifecycle'
    ).mockResolvedValue('expired');
    vi.spyOn(appSocialSession, 'renewAppSocialSession').mockImplementation(
      async (input) => {
        await input.connectWithOptions(ALLOW_OPTIONS as never);
        return true;
      }
    );
    vi.useFakeTimers();
    try {
      let settled: unknown = 'pending';
      void apiRef.current!.resumeSocialSession().then(
        (ready) => {
          settled = ready;
        },
        (error: unknown) => {
          settled = error;
        }
      );
      await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
      });
      expect(harness.connect).toHaveBeenCalled();
      expect(settled).toBe('pending');
      await vi.advanceTimersByTimeAsync(120_000);
      await act(async () => {
        await Promise.resolve();
      });
      expect(settled).toBe(false);
      expect(accountSnapshot()).toEqual({
        account: 'alice.near',
        stored: 'alice.near',
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it('routes session bootstrap through the same guarded connect', async () => {
    const wallet = await mountConnectedAlice();
    let guarded: ((options: unknown) => Promise<unknown>) | null = null;
    sessionSpy!.mockImplementation(async (_accountId, connectWithOptions) => {
      guarded = connectWithOptions;
      return false;
    });
    await act(async () => {
      await apiRef.current!.connect();
    });
    expect(guarded).toEqual(expect.any(Function));
    signInAs(wallet, 'bob.near');
    const complete = vi
      .spyOn(appSocialSession, 'completeAppSessionAfterConnect')
      .mockResolvedValue(undefined);
    await expect(guarded!(ALLOW_OPTIONS)).rejects.toMatchObject({
      name: 'WalletConnectedReviewError',
      accountId: 'bob.near',
    });
    expect(complete).not.toHaveBeenCalled();
    expect(accountSnapshot()).toEqual({
      account: 'alice.near',
      stored: 'alice.near',
    });

    harness.connect.mockReset();
    harness.connect.mockImplementation(() => new Promise(() => {}));
    vi.useFakeTimers();
    try {
      let settled: unknown = 'pending';
      void guarded!(ALLOW_OPTIONS).then(
        () => {
          settled = 'resolved';
        },
        (error: unknown) => {
          settled = error;
        }
      );
      await act(async () => {
        await Promise.resolve();
      });
      await vi.advanceTimersByTimeAsync(120_000);
      await act(async () => {
        await Promise.resolve();
      });
      expect(settled).toMatchObject({ name: 'WalletPickerTimeoutError' });
      expect(accountSnapshot()).toEqual({
        account: 'alice.near',
        stored: 'alice.near',
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it('shows the review notice from Allow and leaves the app account', async () => {
    vi.spyOn(appSocialSession, 'restoreAppSocialSession').mockResolvedValue(
      null
    );
    vi.spyOn(
      appSocialSession,
      'getAppSocialSessionLifecycle'
    ).mockResolvedValue('missing');
    vi.spyOn(appSocialSession, 'grantAppSocialSession').mockImplementation(
      async (input) => {
        await input.connectWithOptions(ALLOW_OPTIONS as never);
        return true;
      }
    );
    const wallet = await mountConnectedAlice(
      createElement(AppAccessSheet, {
        open: true,
        accountId: 'alice.near',
        onClose() {},
      })
    );
    signInAs(wallet, 'bob.near');
    await expect
      .poll(() => collectText(renderer!.root), { interval: 20, timeout: 2000 })
      .toContain('Allow access');
    const allow = renderer!.root.findAll(
      (node) =>
        node.type === 'button' && collectText(node).includes('Allow access')
    )[0]!;
    await act(async () => {
      allow.props.onClick();
    });
    await expect
      .poll(() => reviewNotice(), { interval: 20, timeout: 2000 })
      .toEqual({
        account: 'alice.near',
        stored: 'alice.near',
        review: true,
        info: true,
      });
  });

  it('shows the review notice from Renew and leaves the app account', async () => {
    vi.spyOn(appSocialSession, 'restoreAppSocialSession').mockResolvedValue(
      null
    );
    vi.spyOn(
      appSocialSession,
      'getAppSocialSessionLifecycle'
    ).mockResolvedValue('expired');
    vi.spyOn(
      appSocialSession,
      'getAppSocialSessionPublicKey'
    ).mockResolvedValue('ed25519:session');
    vi.spyOn(appSocialSession, 'renewAppSocialSession').mockImplementation(
      async (input) => {
        await input.connectWithOptions(ALLOW_OPTIONS as never);
        return true;
      }
    );
    const wallet = await mountConnectedAlice(
      createElement(AppAccessSheet, {
        open: true,
        accountId: 'alice.near',
        onClose() {},
      })
    );
    signInAs(wallet, 'bob.near');
    await expect
      .poll(() => collectText(renderer!.root), { interval: 20, timeout: 2000 })
      .toContain('Renew access');
    const renew = renderer!.root.findAll(
      (node) =>
        node.type === 'button' && collectText(node).includes('Renew access')
    )[0]!;
    await act(async () => {
      renew.props.onClick();
    });
    await expect
      .poll(() => reviewNotice(), { interval: 20, timeout: 2000 })
      .toEqual({
        account: 'alice.near',
        stored: 'alice.near',
        review: true,
        info: true,
      });
  });
});

function paidListing(creatorId: string) {
  return {
    status: 'listed' as const,
    tokenId: 'lot-1',
    creatorId,
    title: 'Field note',
    description: 'A note',
    mediaUrl: 'https://example.com/cover.png',
    priceNear: '1',
    sourcePostPath: `${creatorId}/post/1`,
  };
}

async function mountPaidBuy(
  creatorId: string,
  footer: { current: { primaryLabel?: string; canSubmit?: boolean } | null }
) {
  await mount(
    createElement(
      Shell,
      null,
      createElement(ScarceBuyForm, {
        formId: 'buy-scarce',
        onFooterStateChange: (state) => {
          footer.current = state;
        },
        listing: paidListing(creatorId),
      })
    )
  );
  await waitForInit();
}

async function resolveSignedOutPicker(accountId: string) {
  const picker = deferred<ReturnType<typeof makeWallet>>();
  harness.connect.mockImplementation(() => picker.promise);
  await act(async () => {
    findForm(renderer!.root).props.onSubmit({ preventDefault() {} });
  });
  await expect
    .poll(() => harness.connect.mock.calls.length, {
      interval: 20,
      timeout: 2000,
    })
    .toBe(1);
  const wallet = makeWallet(accountId);
  wallet.signAndSendTransaction.mockResolvedValue({
    transaction: { hash: 'tx-buy' },
  });
  await act(async () => {
    harness.getConnectedWallet.mockResolvedValue({
      wallet,
      accounts: [{ accountId }],
    });
    picker.resolve(wallet);
  });
  await expect
    .poll(() => apiRef.current?.accountId, { interval: 20, timeout: 2000 })
    .toBe(accountId);
  return wallet;
}

function saleReads(): number {
  return viewNearContract.mock.calls.filter((call) => call[1] === 'get_sale')
    .length;
}

function depositOf(wallet: ReturnType<typeof makeWallet>): string | undefined {
  const request = wallet.signAndSendTransaction.mock.calls[0]?.[0] as
    | { actions?: Array<{ params?: { deposit?: string } }> }
    | undefined;
  return request?.actions?.[0]?.params?.deposit;
}
