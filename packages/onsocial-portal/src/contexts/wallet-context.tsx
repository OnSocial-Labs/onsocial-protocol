'use client';

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  ReactNode,
} from 'react';
import { NearConnector } from '@hot-labs/near-connect';
import type { NearWalletBase } from '@hot-labs/near-connect';
import {
  TransactionFeedbackToast,
  type TransactionFeedback,
} from '@/components/ui/transaction-feedback-toast';
import { isIgnorableWalletError } from '@/lib/wallet-errors';
import {
  runPortalConnect,
  type PortalSessionFeedback,
} from '@/lib/portal-connect-flow';
import {
  clearPortalSocialSession,
  completePortalSessionAfterConnect,
  finishPortalSessionLogin,
  portalSessionConnectOptions,
  restorePortalSocialSession,
  resolvePortalSessionPlan,
} from '@/lib/portal-social-session';
import {
  txToastConnectError,
  txToastConnectPending,
  txToastConnectSuccess,
} from '@/lib/transaction-toast-copy';
import {
  accountNeedsWelcomeNearFunding,
  requestWelcomeNearIfNeeded,
} from '@/lib/welcome-near';

const PORTAL_WALLET_ACCOUNT_KEY = 'onsocial.portal.wallet.accountId';

// ---------------------------------------------------------------------------
// Context types
// ---------------------------------------------------------------------------

interface SigningWallet {
  wallet: NearWalletBase;
  accountId: string;
}

interface WalletContextType {
  connector: NearConnector | null;
  wallet: NearWalletBase | null;
  accountId: string | null;
  isConnected: boolean;
  isLoading: boolean;
  isBootstrappingSocialSession: boolean;
  connect: () => Promise<void>;
  switchWallet: () => Promise<void>;
  disconnect: () => Promise<void>;
  getSigningWallet: () => Promise<SigningWallet>;
}

function isIgnorableConnectError(error: unknown): boolean {
  return isIgnorableWalletError(error);
}

function toTransactionFeedback(
  feedback: PortalSessionFeedback | null
): TransactionFeedback | null {
  if (!feedback) return null;
  if (feedback.type === 'pending') {
    return {
      type: 'pending',
      pendingPhase: feedback.pendingPhase,
      msg:
        feedback.pendingMessage === 'approveInWallet'
          ? txToastConnectPending.approveInWallet
          : txToastConnectPending.settingUpSession,
    };
  }
  if (feedback.type === 'success') {
    return {
      type: 'success',
      msg: txToastConnectSuccess.sessionReady,
    };
  }
  return {
    type: 'error',
    msg: txToastConnectError.sessionSetupFailed,
  };
}

function readStoredWalletAccountId(): string | null {
  try {
    return window.localStorage.getItem(PORTAL_WALLET_ACCOUNT_KEY);
  } catch {
    return null;
  }
}

function writeStoredWalletAccountId(accountId: string | null): void {
  try {
    if (accountId) {
      window.localStorage.setItem(PORTAL_WALLET_ACCOUNT_KEY, accountId);
    } else {
      window.localStorage.removeItem(PORTAL_WALLET_ACCOUNT_KEY);
    }
  } catch {
    // Keep wallet state working even when storage is unavailable.
  }
}

function pickRestoredAccountId(
  accounts: Array<{ accountId: string }>,
  storedHint: string | null,
  options?: { freshSignIn?: boolean }
): string | null {
  if (accounts.length === 0) {
    return null;
  }

  if (options?.freshSignIn) {
    return accounts[0]?.accountId ?? null;
  }

  if (storedHint) {
    const restoredAccount = accounts.find(
      (account) => account.accountId === storedHint
    );
    if (restoredAccount) return restoredAccount.accountId;
  }

  if (accounts.length === 1) {
    return accounts[0].accountId;
  }

  return null;
}

const WalletContext = createContext<WalletContextType>({
  connector: null,
  wallet: null,
  accountId: null,
  isConnected: false,
  isLoading: true,
  connect: async () => {},
  switchWallet: async () => {},
  disconnect: async () => {},
  isBootstrappingSocialSession: false,
  getSigningWallet: async () => {
    throw new Error('WalletProvider is not mounted');
  },
});

export function useWallet() {
  return useContext(WalletContext);
}

interface WalletProviderProps {
  children: ReactNode;
  network?: 'testnet' | 'mainnet';
}

export function WalletProvider({
  children,
  network = 'testnet',
}: WalletProviderProps) {
  const [wallet, setWallet] = useState<NearWalletBase | null>(null);
  const [accountId, setAccountId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isBootstrappingSocialSession, setIsBootstrappingSocialSession] =
    useState(false);
  const [connectFeedback, setConnectFeedback] =
    useState<TransactionFeedback | null>(null);
  const connectorRef = useRef<NearConnector | null>(null);
  const connectPromiseRef = useRef<Promise<SigningWallet> | null>(null);

  const applyWalletConnection = useCallback(
    (connectedWallet: NearWalletBase, nextAccountId: string) => {
      setWallet(connectedWallet);
      setAccountId(nextAccountId);
      writeStoredWalletAccountId(nextAccountId);
    },
    []
  );

  const clearConnectFeedback = useCallback(() => {
    setConnectFeedback(null);
  }, []);

  const tryReuseConnectedWallet = useCallback(
    async (
      connector: NearConnector,
      storedHint: string | null
    ): Promise<{ wallet: NearWalletBase; accountId: string } | null> => {
      try {
        const { wallet: connectedWallet, accounts } =
          await connector.getConnectedWallet();
        const nextAccountId = pickRestoredAccountId(accounts, storedHint);
        if (!connectedWallet || !nextAccountId) {
          return null;
        }
        return { wallet: connectedWallet, accountId: nextAccountId };
      } catch {
        return null;
      }
    },
    []
  );

  const performPortalConnect = useCallback(
    async (
      storedHint: string | null,
      options?: { forcePicker?: boolean }
    ): Promise<SigningWallet> => {
      const c = connectorRef.current;
      if (!c) {
        throw new Error('Wallet is still loading. Try again in a moment.');
      }

      return runPortalConnect({
        storedHint,
        forcePicker: options?.forcePicker,
        tryReuseConnectedWallet: () => tryReuseConnectedWallet(c, storedHint),
        resolveSessionPlan: resolvePortalSessionPlan,
        accountNeedsWelcomeNearFunding,
        sessionConnectOptions: portalSessionConnectOptions,
        connect: (connectOptions) => c.connect(connectOptions ?? {}),
        subscribeSignIn: (listener) => {
          const handler = (event: {
            accounts: Array<{ accountId: string }>;
          }) => {
            listener(event.accounts);
          };
          c.once('wallet:signIn', handler);
          return () => {
            c.off('wallet:signIn', handler);
          };
        },
        getAccounts: (connectedWallet) =>
          connectedWallet.getAccounts({ network }),
        pickAccountId: (accounts, hint, freshSignIn) =>
          pickRestoredAccountId(accounts, hint, { freshSignIn }),
        requestWelcomeNearIfNeeded,
        finishSessionLogin: (
          nextAccountId,
          pendingSessionKey,
          signInWelcome,
          hooks
        ) =>
          finishPortalSessionLogin(
            nextAccountId,
            pendingSessionKey,
            signInWelcome,
            (connectOptions) => c.connect(connectOptions),
            hooks
          ),
        completeSession: completePortalSessionAfterConnect,
        hasSession: async (nextAccountId) =>
          Boolean(await restorePortalSocialSession(nextAccountId)),
        onConnected: (connectedWallet, nextAccountId) => {
          applyWalletConnection(connectedWallet, nextAccountId);
        },
        onFeedback: (feedback) => {
          setConnectFeedback(toTransactionFeedback(feedback));
        },
        onBootstrapping: setIsBootstrappingSocialSession,
      });
    },
    [applyWalletConnection, network, tryReuseConnectedWallet]
  );

  useEffect(() => {
    const connector = new NearConnector({
      network,
      footerBranding: {
        heading: 'OnSocial Protocol',
        link: 'https://onsocial.id',
        linkText: 'onsocial.id',
      },
    });
    connectorRef.current = connector;

    connector.on('wallet:signOut', async () => {
      const signingOutAccountId = readStoredWalletAccountId();
      if (signingOutAccountId) {
        await clearPortalSocialSession(signingOutAccountId);
      }
      setWallet(null);
      setAccountId(null);
      writeStoredWalletAccountId(null);
    });

    let cancelled = false;

    (async () => {
      try {
        const { wallet: connectedWallet, accounts } =
          await connector.getConnectedWallet();
        if (!cancelled) {
          const nextAccountId = pickRestoredAccountId(
            accounts,
            readStoredWalletAccountId()
          );
          setWallet(nextAccountId ? connectedWallet : null);
          setAccountId(nextAccountId);
          if (nextAccountId) {
            writeStoredWalletAccountId(nextAccountId);
          }
        }
      } catch {
        // not signed in – that's fine
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();

    return () => {
      cancelled = true;
      connector.removeAllListeners();
    };
  }, [network]);

  useEffect(() => {
    function handleWindowError(event: ErrorEvent) {
      if (!isIgnorableConnectError(event.error ?? event.message)) return;
      event.preventDefault();
    }

    function handleUnhandledRejection(event: PromiseRejectionEvent) {
      if (!isIgnorableConnectError(event.reason)) return;
      event.preventDefault();
    }

    window.addEventListener('error', handleWindowError);
    window.addEventListener('unhandledrejection', handleUnhandledRejection);

    return () => {
      window.removeEventListener('error', handleWindowError);
      window.removeEventListener(
        'unhandledrejection',
        handleUnhandledRejection
      );
    };
  }, []);

  const connect = useCallback(async () => {
    if (connectPromiseRef.current) {
      await connectPromiseRef.current;
      return;
    }

    const connectPromise = performPortalConnect(readStoredWalletAccountId())
      .catch((error) => {
        if (isIgnorableConnectError(error)) return;
        throw error;
      })
      .finally(() => {
        connectPromiseRef.current = null;
      });

    connectPromiseRef.current = connectPromise as Promise<SigningWallet>;
    await connectPromise;
  }, [performPortalConnect]);

  const switchWallet = useCallback(async () => {
    if (connectPromiseRef.current) {
      await connectPromiseRef.current;
      return;
    }

    const connectPromise = performPortalConnect(null, { forcePicker: true })
      .catch((error) => {
        if (isIgnorableConnectError(error)) return;
        throw error;
      })
      .finally(() => {
        connectPromiseRef.current = null;
      });

    connectPromiseRef.current = connectPromise as Promise<SigningWallet>;
    await connectPromise;
  }, [performPortalConnect]);

  const disconnect = useCallback(async () => {
    const c = connectorRef.current;
    if (!c) return;
    const disconnectingAccountId = accountId ?? readStoredWalletAccountId();
    if (disconnectingAccountId) {
      await clearPortalSocialSession(disconnectingAccountId);
    }
    await c.disconnect();
    setWallet(null);
    setAccountId(null);
    writeStoredWalletAccountId(null);
    clearConnectFeedback();
  }, [accountId, clearConnectFeedback]);

  const getSigningWallet = useCallback(async (): Promise<SigningWallet> => {
    const c = connectorRef.current;
    if (!c) {
      throw new Error('Wallet is still loading. Try again in a moment.');
    }

    const storedHint = accountId ?? readStoredWalletAccountId();

    try {
      const { wallet: connectedWallet, accounts } =
        await c.getConnectedWallet();
      const resolvedAccountId = pickRestoredAccountId(accounts, storedHint);
      if (connectedWallet && resolvedAccountId) {
        const session = await restorePortalSocialSession(resolvedAccountId);
        if (session) {
          applyWalletConnection(connectedWallet, resolvedAccountId);
          return { wallet: connectedWallet, accountId: resolvedAccountId };
        }
      }
    } catch {
      // Fall through to an explicit connect().
    }

    if (connectPromiseRef.current) {
      return connectPromiseRef.current;
    }

    const connectPromise = performPortalConnect(storedHint).finally(() => {
      connectPromiseRef.current = null;
    });
    connectPromiseRef.current = connectPromise;
    return connectPromise;
  }, [accountId, applyWalletConnection, performPortalConnect]);

  const value: WalletContextType = {
    connector: connectorRef.current,
    wallet,
    accountId,
    isConnected: !!accountId,
    isLoading,
    isBootstrappingSocialSession,
    connect,
    switchWallet,
    disconnect,
    getSigningWallet,
  };

  return (
    <WalletContext.Provider value={value}>
      {children}
      <TransactionFeedbackToast
        result={connectFeedback}
        onClose={clearConnectFeedback}
      />
    </WalletContext.Provider>
  );
}
