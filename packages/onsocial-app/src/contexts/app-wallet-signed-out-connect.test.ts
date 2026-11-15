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
import type { OwnedScarceItem } from '@/features/market/market-listings';

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const LOADING = /Wallet is still loading/;

const harness = vi.hoisted(() => {
  const connect = vi.fn(() => new Promise(() => {}));
  const getConnectedWallet = vi.fn(async () => {
    throw new Error('no wallet');
  });
  const wallets: Array<{
    signAndSendTransaction: ReturnType<typeof vi.fn>;
  }> = [];
  return { connect, getConnectedWallet, wallets };
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
    once = vi.fn();
    off = vi.fn();
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
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/api/account-exists')) {
        return new Response(JSON.stringify({ exists: true }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      throw new Error('offline');
    })
  );
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
    installBrowser();
    harness.wallets.length = 0;
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
});
