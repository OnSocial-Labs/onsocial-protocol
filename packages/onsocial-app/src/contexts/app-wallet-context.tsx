'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { NearConnector } from '@hot-labs/near-connect';
import type { NearWalletBase } from '@hot-labs/near-connect';
import { ACTIVE_NEAR_NETWORK } from '@/lib/app-config';
import { bootstrapAppSocialSession } from '@/lib/app-social-session';

const APP_WALLET_ACCOUNT_KEY = 'onsocial.app.wallet.accountId';

interface SigningWallet {
  wallet: NearWalletBase;
  accountId: string;
}

interface AppWalletContextType {
  accountId: string | null;
  isConnected: boolean;
  isLoading: boolean;
  hasSocialSession: boolean;
  isBootstrappingSession: boolean;
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
  getSigningWallet: () => Promise<SigningWallet>;
}

function readStoredWalletAccountId(): string | null {
  try {
    return window.localStorage.getItem(APP_WALLET_ACCOUNT_KEY);
  } catch {
    return null;
  }
}

function writeStoredWalletAccountId(accountId: string | null): void {
  try {
    if (accountId) {
      window.localStorage.setItem(APP_WALLET_ACCOUNT_KEY, accountId);
    } else {
      window.localStorage.removeItem(APP_WALLET_ACCOUNT_KEY);
    }
  } catch {
    // ignore
  }
}

function pickRestoredAccountId(
  accounts: Array<{ accountId: string }>,
  preferredAccountId: string | null
): string | null {
  if (preferredAccountId) {
    const match = accounts.find(
      (account) => account.accountId === preferredAccountId
    );
    if (match) return match.accountId;
  }

  return accounts.length === 1 ? accounts[0].accountId : null;
}

const AppWalletContext = createContext<AppWalletContextType>({
  accountId: null,
  isConnected: false,
  isLoading: true,
  hasSocialSession: false,
  isBootstrappingSession: false,
  connect: async () => {},
  disconnect: async () => {},
  getSigningWallet: async () => {
    throw new Error('AppWalletProvider is not mounted');
  },
});

export function useAppWallet() {
  return useContext(AppWalletContext);
}

export function AppWalletProvider({ children }: { children: ReactNode }) {
  const [wallet, setWallet] = useState<NearWalletBase | null>(null);
  const [accountId, setAccountId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [hasSocialSession, setHasSocialSession] = useState(false);
  const [isBootstrappingSession, setIsBootstrappingSession] = useState(false);
  const connectorRef = useRef<NearConnector | null>(null);
  const connectPromiseRef = useRef<Promise<void> | null>(null);
  const network = ACTIVE_NEAR_NETWORK;

  const ensureSocialSession = useCallback(
    async (nextAccountId: string) => {
      const connector = connectorRef.current;
      if (!connector) return;

      setIsBootstrappingSession(true);
      try {
        const ready = await bootstrapAppSocialSession(nextAccountId, (options) =>
          connector.connect(options)
        );
        setHasSocialSession(ready);
      } catch {
        setHasSocialSession(false);
      } finally {
        setIsBootstrappingSession(false);
      }
    },
    []
  );

  useEffect(() => {
    const connector = new NearConnector({
      network,
      footerBranding: {
        heading: 'OnSocial',
        link: 'https://onsocial.id',
        linkText: 'onsocial.id',
      },
    });
    connectorRef.current = connector;

    connector.on('wallet:signIn', (event) => {
      const nextAccountId = event.accounts[0]?.accountId ?? null;
      setWallet(nextAccountId ? event.wallet : null);
      setAccountId(nextAccountId);
      writeStoredWalletAccountId(nextAccountId);
      if (nextAccountId) {
        void ensureSocialSession(nextAccountId);
      } else {
        setHasSocialSession(false);
      }
    });

    connector.on('wallet:signOut', () => {
      setWallet(null);
      setAccountId(null);
      setHasSocialSession(false);
      writeStoredWalletAccountId(null);
    });

    let cancelled = false;

    void (async () => {
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
          if (nextAccountId) {
            void ensureSocialSession(nextAccountId);
          }
        }
      } catch {
        // not signed in
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();

    return () => {
      cancelled = true;
      connector.removeAllListeners();
    };
  }, [ensureSocialSession, network]);

  const connect = useCallback(async () => {
    const connector = connectorRef.current;
    if (!connector) return;
    if (connectPromiseRef.current) {
      await connectPromiseRef.current;
      return;
    }

    const connectPromise = connector
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
        if (nextAccountId) {
          await ensureSocialSession(nextAccountId);
        }
      })
      .finally(() => {
        connectPromiseRef.current = null;
      });

    connectPromiseRef.current = connectPromise;
    await connectPromise;
  }, [ensureSocialSession, network]);

  const disconnect = useCallback(async () => {
    const connector = connectorRef.current;
    if (!connector) return;
    await connector.disconnect();
    setWallet(null);
    setAccountId(null);
    setHasSocialSession(false);
    writeStoredWalletAccountId(null);
  }, []);

  const getSigningWallet = useCallback(async (): Promise<SigningWallet> => {
    const connector = connectorRef.current;
    if (!connector) {
      throw new Error('Wallet is still loading. Try again in a moment.');
    }

    const preferredAccountId = accountId ?? readStoredWalletAccountId();

    try {
      const { wallet: connectedWallet, accounts } =
        await connector.getConnectedWallet();
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
      // reconnect below
    }

    const connectedWallet = await connector.connect();
    const accounts = await connectedWallet.getAccounts({ network });
    const resolvedAccountId = pickRestoredAccountId(
      accounts,
      preferredAccountId
    );
    if (!resolvedAccountId) {
      throw new Error('Select a wallet account and try again.');
    }

    setWallet(connectedWallet);
    setAccountId(resolvedAccountId);
    writeStoredWalletAccountId(resolvedAccountId);
    return { wallet: connectedWallet, accountId: resolvedAccountId };
  }, [accountId, network]);

  return (
    <AppWalletContext.Provider
      value={{
        accountId,
        isConnected: Boolean(accountId),
        isLoading,
        hasSocialSession,
        isBootstrappingSession,
        connect,
        disconnect,
        getSigningWallet,
      }}
    >
      {children}
    </AppWalletContext.Provider>
  );
}
