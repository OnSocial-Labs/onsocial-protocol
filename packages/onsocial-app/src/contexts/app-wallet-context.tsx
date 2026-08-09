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
import {
  bootstrapAppSocialSession,
  restoreAppSocialSession,
} from '@/lib/app-social-session';
import { clearAppGatewayAuth } from '@/lib/app-gateway-auth';
import { invalidateAppSocialSessionCache } from '@/lib/app-social-session-cache';
import { isWalletUserCancellation } from '@/lib/wallet-errors';

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
  /** Re-run session bootstrap for the connected account (no wallet picker). */
  resumeSocialSession: () => Promise<boolean>;
  switchWallet: () => Promise<void>;
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
  preferredAccountId: string | null,
  options?: { freshSignIn?: boolean }
): string | null {
  if (accounts.length === 0) {
    return null;
  }

  if (options?.freshSignIn) {
    return accounts[0]?.accountId ?? null;
  }

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
  resumeSocialSession: async () => false,
  switchWallet: async () => {},
  disconnect: async () => {},
  getSigningWallet: async () => {
    throw new Error('AppWalletProvider is not mounted');
  },
});

export function useAppWallet() {
  return useContext(AppWalletContext);
}

export function AppWalletProvider({ children }: { children: ReactNode }) {
  const [, setWallet] = useState<NearWalletBase | null>(null);
  const [accountId, setAccountId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [hasSocialSession, setHasSocialSession] = useState(false);
  const [isBootstrappingSession, setIsBootstrappingSession] = useState(false);
  const connectorRef = useRef<NearConnector | null>(null);
  const connectPromiseRef = useRef<Promise<void> | null>(null);
  /** One bootstrap at a time — AddKey must reuse the same pending key. */
  const bootstrapPromiseRef = useRef<Promise<boolean> | null>(null);
  const bootstrappingAccountRef = useRef<string | null>(null);
  const network = ACTIVE_NEAR_NETWORK;

  const ensureSocialSession = useCallback(
    async (nextAccountId: string): Promise<boolean> => {
      const connector = connectorRef.current;
      if (!connector) return false;

      if (
        bootstrapPromiseRef.current &&
        bootstrappingAccountRef.current === nextAccountId
      ) {
        return bootstrapPromiseRef.current;
      }

      const run = (async (): Promise<boolean> => {
        setIsBootstrappingSession(true);
        try {
          const ready = await bootstrapAppSocialSession(
            nextAccountId,
            (options) => connector.connect(options)
          );
          setHasSocialSession(ready);
          if (ready) {
            invalidateAppSocialSessionCache();
          }
          return ready;
        } catch (error) {
          if (!isWalletUserCancellation(error)) {
            console.warn('OnSocial session bootstrap failed', error);
          }
          setHasSocialSession(false);
          return false;
        } finally {
          setIsBootstrappingSession(false);
          bootstrapPromiseRef.current = null;
          bootstrappingAccountRef.current = null;
        }
      })();

      bootstrapPromiseRef.current = run;
      bootstrappingAccountRef.current = nextAccountId;
      return run;
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
        // Skip nested bootstrap while AddKey connect is already in flight.
        if (bootstrappingAccountRef.current === nextAccountId) return;
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
      invalidateAppSocialSessionCache();
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

  const resumeSocialSession = useCallback(async (): Promise<boolean> => {
    const nextAccountId = accountId ?? readStoredWalletAccountId();
    if (!nextAccountId) return false;
    try {
      // Fast path: local session still valid — avoid reopening the wallet.
      if (await restoreAppSocialSession(nextAccountId)) {
        setHasSocialSession(true);
        invalidateAppSocialSessionCache();
        return true;
      }
    } catch (error) {
      if (!isWalletUserCancellation(error)) {
        console.warn('OnSocial session restore failed', error);
      }
      // Fall through to full bootstrap (AddKey) when restore cannot verify.
    }
    return ensureSocialSession(nextAccountId);
  }, [accountId, ensureSocialSession]);

  const connect = useCallback(async () => {
    const connector = connectorRef.current;
    if (!connector) return;
    if (connectPromiseRef.current) {
      await connectPromiseRef.current;
      return;
    }

    // Already signed in — resume session instead of reopening the picker.
    try {
      const { wallet: connectedWallet, accounts } =
        await connector.getConnectedWallet();
      const nextAccountId = pickRestoredAccountId(
        accounts,
        accountId ?? readStoredWalletAccountId()
      );
      if (connectedWallet && nextAccountId) {
        setWallet(connectedWallet);
        setAccountId(nextAccountId);
        writeStoredWalletAccountId(nextAccountId);
        await ensureSocialSession(nextAccountId);
        return;
      }
    } catch {
      // fall through to fresh connect
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
  }, [accountId, ensureSocialSession, network]);

  const switchWallet = useCallback(async () => {
    const connector = connectorRef.current;
    if (!connector) return;
    if (connectPromiseRef.current) {
      await connectPromiseRef.current;
      return;
    }

    const connectPromise = (async () => {
      let signedInAccounts: Array<{ accountId: string }> = [];
      const captureSignIn = (event: {
        accounts: Array<{ accountId: string }>;
      }) => {
        signedInAccounts = event.accounts;
      };
      connector.once('wallet:signIn', captureSignIn);

      try {
        // Skip reuse of the current connection so the picker always opens.
        const connectedWallet = await connector.connect({});
        const accounts =
          signedInAccounts.length > 0
            ? signedInAccounts
            : await connectedWallet.getAccounts({ network });
        const nextAccountId = pickRestoredAccountId(accounts, null, {
          freshSignIn: signedInAccounts.length > 0,
        });
        if (!nextAccountId) {
          throw new Error('Select a wallet account and try again.');
        }

        setWallet(connectedWallet);
        setAccountId(nextAccountId);
        writeStoredWalletAccountId(nextAccountId);
        await ensureSocialSession(nextAccountId);
      } finally {
        connector.off('wallet:signIn', captureSignIn);
      }
    })()
      .catch((error) => {
        if (isWalletUserCancellation(error)) return;
        throw error;
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
    const previousAccountId = accountId;
    await connector.disconnect();
    setWallet(null);
    setAccountId(null);
    setHasSocialSession(false);
    writeStoredWalletAccountId(null);
    invalidateAppSocialSessionCache();
    clearAppGatewayAuth(previousAccountId);
  }, [accountId]);

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
        resumeSocialSession,
        switchWallet,
        disconnect,
        getSigningWallet,
      }}
    >
      {children}
    </AppWalletContext.Provider>
  );
}
