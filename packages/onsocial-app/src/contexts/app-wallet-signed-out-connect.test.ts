// @ts-nocheck — renderer tests follow the existing panel harness, which has no renderer types.
import { act, createElement, useEffect, type ReactNode } from 'react';
import {
  create,
  type ReactTestInstance,
  type ReactTestRenderer,
} from 'react-test-renderer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppTransactionFeedbackProvider } from '@/contexts/app-transaction-feedback-context';
import { AppWalletProvider, useAppWallet } from '@/contexts/app-wallet-context';
import { OsDockAccountZone } from '@/components/wallet/os-dock-account-zone';
import { ScarceBuyForm } from '@/features/scarces/scarce-buy-form';
import { ScarceBuySheet } from '@/features/scarces/scarce-buy-sheet';
import { ScarceBidForm } from '@/features/scarces/scarce-bid-form';
import { ScarceTransferForm } from '@/features/scarces/scarce-transfer-form';
import { HubPublishRequestsSheet } from '@/features/scarces/hub-publish-requests-sheet';
import { NearAccountField } from '@/components/ui/near-account-field';
import { useOsAppNavigate } from '@/hooks/use-os-app-navigate';
import * as appSocialSession from '@/lib/app-social-session';
import * as scarceAuction from '@/features/scarces/scarce-auction';
import * as publishAccess from '@/features/scarces/hub-publish-access';
import { APP_WALLET_ACCOUNT_KEY } from '@/lib/gate-return';
import { viewNearContract } from '@/lib/app-near-rpc';

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const LOADING = /Wallet is still loading/;
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
    (event: { accounts: Array<{ accountId: string }> }) => void
  >();
  return {
    connect,
    getConnectedWallet,
    wallets,
    signInListeners,
    emitSignIn(accounts: Array<{ accountId: string }>) {
      signInListeners.forEach((listener) => listener({ accounts }));
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
    on = vi.fn();
    once = (
      event: string,
      listener: (event: { accounts: Array<{ accountId: string }> }) => void
    ) => {
      if (event === 'wallet:signIn') harness.signInListeners.add(listener);
    };
    off = (
      event: string,
      listener: (event: { accounts: Array<{ accountId: string }> }) => void
    ) => {
      if (event === 'wallet:signIn') harness.signInListeners.delete(listener);
    };
    removeAllListeners = vi.fn();
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
    return jsonResponse({ exists: true });
  }
  if (url.includes('/api/near/rpc')) {
    const body = JSON.parse(String(init?.body ?? '{}')) as {
      method?: string;
      params?: { request_type?: string; account_id?: string };
    };
    if (body.method === 'query' && body.params?.request_type === 'view_account') {
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
      hung.resolve(makeWallet('carol.near'));
      await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
      });
      expect(apiRef.current?.accountId ?? null).toBeNull();
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
      next.resolve(makeWallet('dana.near'));
      await expect(again).rejects.toMatchObject({
        name: 'WalletConnectedReviewError',
        accountId: 'dana.near',
      });
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
      harness.emitSignIn([{ accountId: 'bob.near' }]);
      return {
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
    await expect(signing).rejects.toMatchObject({
      name: 'WalletConnectedReviewError',
      accountId: 'visitor.near',
    });
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
    await expect(first).rejects.toMatchObject({
      name: 'WalletConnectedReviewError',
      accountId: 'alice.near',
    });
    await expect
      .poll(() => harness.connect.mock.calls.length, {
        interval: 15,
        timeout: 2000,
      })
      .toBe(2);
    secondPicker.resolve(makeWallet('bob.near'));
    await expect(second).rejects.toMatchObject({
      name: 'WalletConnectedReviewError',
      accountId: 'bob.near',
    });
  });

  it('returns to the buy sheet after the picker so a payer confirms on the second tap', async () => {
    reviewRpc.balances.set('payer.near', PAYER_BALANCE_YOCTO);
    const footer = { current: null as { primaryLabel?: string; canSubmit?: boolean } | null };
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
    .poll(() => harness.connect.mock.calls.length, { interval: 20, timeout: 2000 })
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
  return viewNearContract.mock.calls.filter((call) => call[1] === 'get_sale').length;
}

function depositOf(wallet: ReturnType<typeof makeWallet>): string | undefined {
  const request = wallet.signAndSendTransaction.mock.calls[0]?.[0] as
    | { actions?: Array<{ params?: { deposit?: string } }> }
    | undefined;
  return request?.actions?.[0]?.params?.deposit;
}
