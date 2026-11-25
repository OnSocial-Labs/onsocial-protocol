// @ts-nocheck — renderer tests follow the existing panel harness, which has no renderer types.
import { act, createElement, memo, useState } from 'react';
import { create, type ReactTestRenderer } from 'react-test-renderer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  AppWalletProvider,
  useAppWallet,
  useAppWalletActions,
} from '@/contexts/app-wallet-context';
import { E2E_MOCK_SIGNER_KEY } from '@/lib/e2e-mock-signer';
import { E2E_WALLET_ACCOUNT_KEY } from '@/lib/e2e-wallet-account';

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

/**
 * Measured on the unmemoized provider (8 mounted feed rows):
 * - scroll x3, same window: 0 row renders
 * - window slide: 0 re-renders of rows that stayed mounted (4 new mounts)
 * - wallet-unrelated provider re-render: 8 row renders, 1 actions-consumer render
 * Loading settle re-rendered the actions consumer (2 total) because it shared
 * the state value.
 */
const VISIBLE_ROWS = 8;

const harness = vi.hoisted(() => {
  const signInListeners = new Set<
    (event: {
      accounts: Array<{ accountId: string }>;
      wallet?: unknown;
    }) => void
  >();
  return {
    rows: [] as number[],
    stayed: [] as number[],
    actionRenders: [] as Array<
      ReturnType<typeof useAppWalletActions>['getSigningWallet']
    >,
    signInListeners,
    getConnectedWallet: vi.fn(async () => {
      throw new Error('no wallet');
    }),
    emitSignIn(accounts: Array<{ accountId: string }>, wallet?: unknown) {
      const event = { accounts, wallet };
      for (const listener of signInListeners) listener(event);
    },
  };
});

vi.mock('@/lib/app-social-session', async () => {
  const actual = await vi.importActual<
    typeof import('@/lib/app-social-session')
  >('@/lib/app-social-session');
  return {
    ...actual,
    restoreAppSocialSession: vi.fn(async () => null),
  };
});

vi.mock('@hot-labs/near-connect', () => {
  class NearConnector {
    connect = vi.fn(async () => {
      throw new Error('connect is not part of this test');
    });
    getConnectedWallet = harness.getConnectedWallet;
    disconnect = vi.fn(async () => {});
    on = (
      event: string,
      listener: (event: {
        accounts: Array<{ accountId: string }>;
        wallet?: unknown;
      }) => void
    ) => {
      if (event === 'wallet:signIn') harness.signInListeners.add(listener);
    };
    off = () => {};
    removeAllListeners = () => {
      harness.signInListeners.clear();
    };
  }
  return { NearConnector };
});

const seenWallets: Array<ReturnType<typeof useAppWallet>> = [];

const FeedRow = memo(function FeedRow({ id }: { id: string }) {
  harness.rows.push(1);
  if (Number(id) >= 4 && Number(id) <= 7) harness.stayed.push(1);
  useAppWallet();
  return createElement('span', { 'data-feed-key': id }, id);
});

const ActionsOnly = memo(function ActionsOnly() {
  harness.actionRenders.push(useAppWalletActions().getSigningWallet);
  return null;
});

const WalletProbe = memo(function WalletProbe() {
  seenWallets.push(useAppWallet());
  return null;
});

function Feed({ start }: { start: number }) {
  const ids = Array.from({ length: VISIBLE_ROWS }, (_, index) => start + index);
  return createElement(
    'div',
    null,
    ids.map((id) => createElement(FeedRow, { key: String(id), id: String(id) }))
  );
}

function ScrollFeed() {
  const [start, setStart] = useState(0);
  const [scrollTop, setScrollTop] = useState(0);
  return createElement(
    'div',
    null,
    createElement('button', {
      type: 'button',
      'data-scroll': String(scrollTop),
      onClick: () => setScrollTop((value) => value + 40),
    }),
    createElement('button', {
      type: 'button',
      'data-window': String(start),
      onClick: () => setStart(4),
    }),
    createElement(Feed, { start })
  );
}

function Shell({ onUnrelated }: { onUnrelated: (fire: () => void) => void }) {
  const [tick, setTick] = useState(0);
  onUnrelated(() => setTick((value) => value + 1));
  return createElement(
    'div',
    { 'data-unrelated': String(tick) },
    createElement(
      AppWalletProvider,
      null,
      createElement(ScrollFeed),
      createElement(WalletProbe),
      createElement(ActionsOnly)
    )
  );
}

function installBrowser() {
  const storage = new Map<string, string>();
  const listeners = new Map<string, Set<() => void>>();
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
  };
  vi.stubGlobal('window', windowStub);
  vi.stubGlobal('document', { visibilityState: 'visible', hidden: false });
}

describe('app wallet context render stability', () => {
  let renderer: ReactTestRenderer | undefined;
  let fireUnrelated: () => void = () => {};

  beforeEach(() => {
    harness.rows.length = 0;
    harness.stayed.length = 0;
    seenWallets.length = 0;
    harness.actionRenders.length = 0;
    harness.signInListeners.clear();
    harness.getConnectedWallet.mockReset();
    harness.getConnectedWallet.mockRejectedValue(new Error('no wallet'));
    installBrowser();
  });

  afterEach(async () => {
    await act(async () => {
      renderer?.unmount();
    });
    renderer = undefined;
    vi.unstubAllGlobals();
  });

  it('keeps feed rows and action callbacks stable across unrelated renders', async () => {
    await act(async () => {
      renderer = create(
        createElement(Shell, {
          onUnrelated: (fire) => {
            fireUnrelated = fire;
          },
        })
      );
    });

    expect(harness.rows.length).toBe(VISIBLE_ROWS * 2);
    expect(harness.actionRenders).toHaveLength(1);
    const settled = seenWallets.at(-1)!;
    expect(settled.isLoading).toBe(false);
    expect(settled.accountId).toBeNull();
    const settledConnect = settled.connect;
    const settledSigner = settled.getSigningWallet;
    expect(harness.actionRenders.at(-1)).toBe(settledSigner);

    harness.rows.length = 0;
    harness.stayed.length = 0;
    const seenAtScroll = seenWallets.length;
    const actionsAtScroll = harness.actionRenders.length;
    const scrollButton = renderer!.root.findByProps({ 'data-scroll': '0' });
    await act(async () => {
      scrollButton.props.onClick();
      scrollButton.props.onClick();
      scrollButton.props.onClick();
    });
    expect(harness.rows.length).toBe(0);
    expect(seenWallets.length).toBe(seenAtScroll);
    expect(harness.actionRenders.length).toBe(actionsAtScroll);

    harness.rows.length = 0;
    harness.stayed.length = 0;
    const windowButton = renderer!.root.findByProps({ 'data-window': '0' });
    await act(async () => {
      windowButton.props.onClick();
    });
    expect(harness.stayed.length).toBe(0);
    expect(harness.rows.length).toBe(4);

    harness.rows.length = 0;
    harness.stayed.length = 0;
    const seenBeforeUnrelated = seenWallets.length;
    const valueBeforeUnrelated = seenWallets.at(-1)!;
    const actionsBeforeUnrelated = harness.actionRenders.length;
    await act(async () => {
      fireUnrelated();
    });
    expect(harness.rows.length).toBe(0);
    expect(harness.stayed.length).toBe(0);
    expect(seenWallets.length).toBe(seenBeforeUnrelated);
    expect(seenWallets.at(-1)).toBe(valueBeforeUnrelated);
    expect(valueBeforeUnrelated.connect).toBe(settledConnect);
    expect(valueBeforeUnrelated.getSigningWallet).toBe(settledSigner);
    expect(valueBeforeUnrelated.clearSessionFeedback).toBe(
      settled.clearSessionFeedback
    );
    expect(valueBeforeUnrelated.disconnect).toBe(settled.disconnect);
    expect(valueBeforeUnrelated.switchWallet).toBe(settled.switchWallet);
    expect(valueBeforeUnrelated.resumeSocialSession).toBe(
      settled.resumeSocialSession
    );
    expect(valueBeforeUnrelated.connectWithOptions).toBe(
      settled.connectWithOptions
    );
    expect(valueBeforeUnrelated.clearSocialSessionLocal).toBe(
      settled.clearSocialSessionLocal
    );
    expect(harness.actionRenders.length).toBe(actionsBeforeUnrelated);
    expect(harness.actionRenders.at(-1)).toBe(settledSigner);

    const wallet = { id: 'hot-wallet' };
    await act(async () => {
      harness.emitSignIn([{ accountId: 'alice.testnet' }], wallet);
    });
    const signedIn = seenWallets.at(-1)!;
    expect(signedIn).not.toBe(valueBeforeUnrelated);
    expect(signedIn.accountId).toBe('alice.testnet');
    expect(signedIn.isConnected).toBe(true);
    expect(signedIn.connect).toBe(settledConnect);
    expect(signedIn.getSigningWallet).toBe(settledSigner);
    expect(harness.actionRenders.length).toBe(actionsBeforeUnrelated);
    expect(harness.actionRenders.at(-1)).toBe(settledSigner);
  });

  it('keeps the e2e paint wallet on the mock signer', async () => {
    window.localStorage.setItem(E2E_WALLET_ACCOUNT_KEY, 'holder.testnet');
    window.localStorage.setItem(E2E_MOCK_SIGNER_KEY, '1');

    await act(async () => {
      renderer = create(
        createElement(
          AppWalletProvider,
          null,
          createElement(WalletProbe),
          createElement(ActionsOnly)
        )
      );
    });

    const value = seenWallets.at(-1)!;
    expect(value.accountId).toBe('holder.testnet');
    expect(value.isConnected).toBe(true);
    expect(value.isLoading).toBe(false);
    const signing = await value.getSigningWallet();
    expect(signing.accountId).toBe('holder.testnet');
    await expect(
      signing.wallet.signAndSendTransaction({
        receiverId: 'social.near',
        actions: [],
      })
    ).rejects.toThrow(/E2E mock signer/);
    expect(harness.actionRenders.at(-1)).toBe(value.getSigningWallet);
  });
});
