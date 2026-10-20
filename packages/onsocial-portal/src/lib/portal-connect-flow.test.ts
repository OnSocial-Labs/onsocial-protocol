import { describe, expect, it, vi } from 'vitest';

import {
  runPortalConnect,
  type PortalConnectFlowDeps,
  type PortalSessionFeedback,
} from '@/lib/portal-connect-flow';
import { WalletActionCancelledError } from '@/lib/wallet-errors';

interface Key {
  publicKey: string;
}

interface Wallet {
  id: string;
}

type Options = { addFunctionCallKey: { publicKey: string } };

function feedbackLabel(feedback: PortalSessionFeedback | null): string {
  if (!feedback) return 'clear';
  if (feedback.type === 'pending') {
    return `${feedback.pendingPhase}:${feedback.pendingMessage}`;
  }
  return `${feedback.type}:${feedback.message}`;
}

function createHarness(
  overrides: Partial<PortalConnectFlowDeps<Wallet, Key, Options>> = {}
) {
  const feedback: string[] = [];
  const bootstrapping: boolean[] = [];
  const connects: Array<Options | null> = [];
  const feedbackAtConnect: string[][] = [];
  const completed: string[] = [];
  const finished: string[] = [];
  const welcomed: string[] = [];
  const connected: string[] = [];
  let signInListener:
    | ((accounts: Array<{ accountId: string }>) => void)
    | null = null;

  const deps: PortalConnectFlowDeps<Wallet, Key, Options> = {
    storedHint: 'rich.testnet',
    tryReuseConnectedWallet: async () => null,
    resolveSessionPlan: async () => ({
      sessionReady: false,
      pendingSessionKey: { publicKey: 'ed25519:pending' },
    }),
    accountNeedsWelcomeNearFunding: async () => false,
    sessionConnectOptions: (key) => ({
      addFunctionCallKey: { publicKey: key.publicKey },
    }),
    connect: async (options) => {
      connects.push(options);
      feedbackAtConnect.push([...feedback]);
      signInListener?.([{ accountId: deps.storedHint ?? 'rich.testnet' }]);
      return { id: 'wallet' };
    },
    subscribeSignIn: (listener) => {
      signInListener = listener;
      return () => {
        signInListener = null;
      };
    },
    getAccounts: async () => [{ accountId: 'rich.testnet' }],
    pickAccountId: (accounts, storedHint, freshSignIn) => {
      if (accounts.length === 0) return null;
      if (freshSignIn) return accounts[0]?.accountId ?? null;
      if (
        storedHint &&
        accounts.some((account) => account.accountId === storedHint)
      ) {
        return storedHint;
      }
      return accounts.length === 1 ? accounts[0].accountId : null;
    },
    requestWelcomeNearIfNeeded: async (accountId) => {
      welcomed.push(accountId);
    },
    finishSessionLogin: async (accountId, _key, welcome, hooks) => {
      finished.push(accountId);
      await welcome;
      hooks.onWalletPrompt();
      hooks.onConfirming();
    },
    completeSession: async (accountId) => {
      completed.push(accountId);
    },
    hasSession: async () => true,
    onConnected: (_wallet, accountId) => {
      connected.push(accountId);
    },
    onFeedback: (next) => {
      feedback.push(feedbackLabel(next));
    },
    onBootstrapping: (active) => {
      bootstrapping.push(active);
    },
    ...overrides,
  };

  return {
    deps,
    feedback,
    bootstrapping,
    connects,
    feedbackAtConnect,
    completed,
    finished,
    welcomed,
    connected,
    signIn(accounts: Array<{ accountId: string }>) {
      signInListener?.(accounts);
    },
  };
}

describe('runPortalConnect', () => {
  it('asks a known funded account to approve the key once, then confirms on chain', async () => {
    const harness = createHarness();
    const result = await runPortalConnect(harness.deps);

    expect(result).toEqual({
      wallet: { id: 'wallet' },
      accountId: 'rich.testnet',
    });
    expect(harness.connects).toEqual([
      { addFunctionCallKey: { publicKey: 'ed25519:pending' } },
    ]);
    expect(harness.feedbackAtConnect).toEqual([['wallet:approveInWallet']]);
    expect(harness.finished).toEqual([]);
    expect(harness.completed).toEqual(['rich.testnet']);
    expect(harness.welcomed).toEqual([]);
    expect(harness.feedback).toEqual([
      'wallet:approveInWallet',
      'chain:approveInWallet',
      'success:sessionReady',
    ]);
    expect(harness.bootstrapping).toEqual([true, false]);
    expect(harness.connected).toEqual(['rich.testnet']);
  });

  it('clears the approval toast when that wallet sheet is cancelled', async () => {
    const harness = createHarness({
      connect: async (options) => {
        harness.connects.push(options);
        throw new WalletActionCancelledError();
      },
    });

    await expect(runPortalConnect(harness.deps)).rejects.toBeInstanceOf(
      WalletActionCancelledError
    );
    expect(harness.feedback).toEqual(['wallet:approveInWallet', 'clear']);
    expect(harness.completed).toEqual([]);
    expect(harness.bootstrapping).toEqual([true, false]);
  });

  it('covers an empty new account with one setup card, then one key approval', async () => {
    let releaseWelcome: () => void = () => {};
    const welcomeGate = new Promise<void>((resolve) => {
      releaseWelcome = resolve;
    });
    const harness = createHarness({
      storedHint: null,
      accountNeedsWelcomeNearFunding: async () => true,
      connect: async (options) => {
        expect(harness.feedback).toEqual([]);
        harness.connects.push(options);
        harness.signIn([{ accountId: 'new.testnet' }]);
        return { id: 'wallet' };
      },
      requestWelcomeNearIfNeeded: () => welcomeGate,
    });
    const pending = runPortalConnect(harness.deps);
    await vi.waitFor(() => {
      expect(harness.feedback).toEqual(['chain:settingUpSession']);
    });
    releaseWelcome();
    const result = await pending;

    expect(result.accountId).toBe('new.testnet');
    expect(harness.connects).toEqual([null]);
    expect(harness.finished).toEqual(['new.testnet']);
    expect(harness.completed).toEqual([]);
    expect(harness.feedback).toEqual([
      'chain:settingUpSession',
      'wallet:approveInWallet',
      'chain:approveInWallet',
      'success:sessionReady',
    ]);
  });

  it('does not flash setup when a connected funded wallet still needs a key', async () => {
    const harness = createHarness({
      tryReuseConnectedWallet: async () => ({
        wallet: { id: 'wallet' },
        accountId: 'rich.testnet',
      }),
    });

    await runPortalConnect(harness.deps);

    expect(harness.connects).toEqual([]);
    expect(harness.finished).toEqual(['rich.testnet']);
    expect(harness.feedback).toEqual([
      'wallet:approveInWallet',
      'wallet:approveInWallet',
      'chain:approveInWallet',
      'success:sessionReady',
    ]);
  });

  it('starts setup immediately for a connected empty wallet', async () => {
    const harness = createHarness({
      tryReuseConnectedWallet: async () => ({
        wallet: { id: 'wallet' },
        accountId: 'new.testnet',
      }),
      accountNeedsWelcomeNearFunding: async () => true,
      resolveSessionPlan: async () => ({
        sessionReady: false,
        pendingSessionKey: { publicKey: 'ed25519:new' },
      }),
    });

    await runPortalConnect(harness.deps);

    expect(harness.connects).toEqual([]);
    expect(harness.feedback).toEqual([
      'chain:settingUpSession',
      'wallet:approveInWallet',
      'chain:approveInWallet',
      'success:sessionReady',
    ]);
  });

  it('keeps the switch-wallet picker free of the previous account key', async () => {
    const harness = createHarness({
      forcePicker: true,
      storedHint: 'rich.testnet',
      connect: async (options) => {
        expect(harness.feedback).toEqual([]);
        harness.connects.push(options);
        harness.signIn([{ accountId: 'other.testnet' }]);
        return { id: 'wallet' };
      },
    });

    await runPortalConnect(harness.deps);

    expect(harness.connects).toEqual([null]);
    expect(harness.completed).toEqual([]);
    expect(harness.finished).toEqual(['other.testnet']);
    expect(harness.feedback[0]).toBe('wallet:approveInWallet');
  });

  it('does not treat a bundled key as landed when a different account signs in', async () => {
    const harness = createHarness({
      connect: async (options) => {
        harness.connects.push(options);
        harness.signIn([{ accountId: 'other.testnet' }]);
        return { id: 'wallet' };
      },
      accountNeedsWelcomeNearFunding: async (accountId) =>
        accountId !== 'rich.testnet',
      resolveSessionPlan: async (accountId) => ({
        sessionReady: false,
        pendingSessionKey: {
          publicKey:
            accountId === 'rich.testnet' ? 'ed25519:rich' : 'ed25519:other',
        },
      }),
    });

    await runPortalConnect(harness.deps);

    expect(harness.connects[0]).toEqual({
      addFunctionCallKey: { publicKey: 'ed25519:rich' },
    });
    expect(harness.completed).toEqual([]);
    expect(harness.finished).toEqual(['other.testnet']);
    expect(harness.welcomed).toEqual(['other.testnet']);
    expect(harness.feedback[0]).toBe('wallet:approveInWallet');
    expect(harness.feedback[1]).toBe('chain:settingUpSession');
  });

  it('clears the card when the key never shows up on chain', async () => {
    const harness = createHarness({
      hasSession: async () => false,
    });

    const result = await runPortalConnect(harness.deps);

    expect(result.accountId).toBe('rich.testnet');
    expect(harness.feedback).toEqual([
      'wallet:approveInWallet',
      'chain:approveInWallet',
      'clear',
    ]);
  });

  it('shows the failure line when key confirmation throws', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const harness = createHarness({
      completeSession: async () => {
        throw new Error('rpc down');
      },
    });

    const result = await runPortalConnect(harness.deps);

    expect(result.accountId).toBe('rich.testnet');
    expect(harness.feedback.at(-1)).toBe('error:sessionSetupFailed');
    warn.mockRestore();
  });

  it('falls back to a plain connect when the balance check fails', async () => {
    const harness = createHarness({
      accountNeedsWelcomeNearFunding: async () => {
        throw new Error('rpc down');
      },
      connect: async (options) => {
        expect(harness.feedback).toEqual([]);
        harness.connects.push(options);
        harness.signIn([{ accountId: 'rich.testnet' }]);
        return { id: 'wallet' };
      },
    });

    await runPortalConnect(harness.deps);

    expect(harness.connects).toEqual([null]);
    expect(harness.finished).toEqual(['rich.testnet']);
    expect(harness.completed).toEqual([]);
  });
});
