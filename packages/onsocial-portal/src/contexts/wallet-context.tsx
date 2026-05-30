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
import { isIgnorableWalletError } from '@/lib/wallet-errors';

const PORTAL_WALLET_ACCOUNT_KEY = 'onsocial.portal.wallet.accountId';

// ---------------------------------------------------------------------------
// Context types
// ---------------------------------------------------------------------------

interface SigningWallet {
  wallet: NearWalletBase;
  accountId: string;
}

interface WalletContextType {
  /** The NearConnector instance (replaces old selector + modal). */
  connector: NearConnector | null;
  /** The active wallet instance, if signed in. */
  wallet: NearWalletBase | null;
  /** Convenience: signed-in account ID. */
  accountId: string | null;
  /** True when a wallet is connected. */
  isConnected: boolean;
  /** True while the connector is initialising / auto-connecting. */
  isLoading: boolean;
  /** Open the wallet-selector popup (or reconnect). */
  connect: () => Promise<void>;
  /** Disconnect the current wallet. */
  disconnect: () => Promise<void>;
  /**
   * Resolve a live wallet instance for signing (reconnects if needed).
   * Call this at the start of a user-initiated sign flow so the extension popup
   * still opens under the browser's user-gesture rules.
   */
  getSigningWallet: () => Promise<SigningWallet>;
}

function isIgnorableConnectError(error: unknown): boolean {
  return isIgnorableWalletError(error);
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
  preferredAccountId: string | null
): string | null {
  if (preferredAccountId) {
    const restoredAccount = accounts.find(
      (account) => account.accountId === preferredAccountId
    );
    if (restoredAccount) return restoredAccount.accountId;
  }

  return accounts.length === 1 ? accounts[0].accountId : null;
}

const WalletContext = createContext<WalletContextType>({
  connector: null,
  wallet: null,
  accountId: null,
  isConnected: false,
  isLoading: true,
  connect: async () => {},
  disconnect: async () => {},
  getSigningWallet: async () => {
    throw new Error('WalletProvider is not mounted');
  },
});

export function useWallet() {
  return useContext(WalletContext);
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

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
  const connectorRef = useRef<NearConnector | null>(null);
  const connectPromiseRef = useRef<Promise<void> | null>(null);

  // ---- initialise connector once ----
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

    // Listen for sign-in
    connector.on('wallet:signIn', (event) => {
      const nextAccountId = event.accounts[0]?.accountId ?? null;
      setWallet(nextAccountId ? event.wallet : null);
      setAccountId(nextAccountId);
      writeStoredWalletAccountId(nextAccountId);
    });

    // Listen for sign-out
    connector.on('wallet:signOut', () => {
      setWallet(null);
      setAccountId(null);
      writeStoredWalletAccountId(null);
    });

    // Auto-connect (check if already signed in)
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
          writeStoredWalletAccountId(nextAccountId);
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

  // ---- actions ----
  const connect = useCallback(async () => {
    const c = connectorRef.current;
    if (!c) return;
    if (connectPromiseRef.current) {
      await connectPromiseRef.current;
      return;
    }

    const connectPromise: Promise<void> = c
      .connect()
      .then(async (connectedWallet) => {
        const accounts = await connectedWallet.getAccounts({ network });
        const nextAccountId = pickRestoredAccountId(
          accounts,
          readStoredWalletAccountId()
        );
        setWallet(nextAccountId ? connectedWallet : null);
        setAccountId(nextAccountId);
        writeStoredWalletAccountId(nextAccountId);
      })
      .catch((error) => {
        if (isIgnorableConnectError(error)) return;
        throw error;
      })
      .finally(() => {
        connectPromiseRef.current = null;
      });

    connectPromiseRef.current = connectPromise;
    await connectPromise;
  }, [network]);

  const disconnect = useCallback(async () => {
    const c = connectorRef.current;
    if (!c) return;
    await c.disconnect();
    setWallet(null);
    setAccountId(null);
    writeStoredWalletAccountId(null);
  }, []);

  const getSigningWallet = useCallback(async (): Promise<SigningWallet> => {
    const c = connectorRef.current;
    if (!c) {
      throw new Error('Wallet is still loading. Try again in a moment.');
    }

    const preferredAccountId = accountId ?? readStoredWalletAccountId();

    try {
      const { wallet: connectedWallet, accounts } =
        await c.getConnectedWallet();
      const resolvedAccountId = pickRestoredAccountId(
        accounts,
        preferredAccountId
      );
      if (connectedWallet && resolvedAccountId) {
        setWallet(connectedWallet);
        setAccountId(resolvedAccountId);
        writeStoredWalletAccountId(resolvedAccountId);
        return { wallet: connectedWallet, accountId: resolvedAccountId };
      }
    } catch {
      // Fall through to an explicit connect().
    }

    const connectedWallet = await c.connect();
    const accounts = await connectedWallet.getAccounts({ network });
    const resolvedAccountId = pickRestoredAccountId(
      accounts,
      preferredAccountId
    );
    if (!resolvedAccountId) {
      throw new Error(
        'Select a wallet account, then press Authorize & save again.'
      );
    }

    setWallet(connectedWallet);
    setAccountId(resolvedAccountId);
    writeStoredWalletAccountId(resolvedAccountId);
    return { wallet: connectedWallet, accountId: resolvedAccountId };
  }, [accountId, network]);

  // ---- value ----
  const value: WalletContextType = {
    connector: connectorRef.current,
    wallet,
    accountId,
    isConnected: !!accountId,
    isLoading,
    connect,
    disconnect,
    getSigningWallet,
  };

  return (
    <WalletContext.Provider value={value}>{children}</WalletContext.Provider>
  );
}
