'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import { NearConnector } from '@hot-labs/near-connect';
import type { NearWalletBase } from '@hot-labs/near-connect';
import type { TransactionFeedback } from '@/components/ui/transaction-feedback-toast';
import { ACTIVE_NEAR_NETWORK } from '@/lib/app-config';
import {
  appSessionConnectOptions,
  bootstrapAppSocialSession,
  completeAppSessionAfterConnect,
  getAppSocialSessionLifecycle,
  renewAppSocialSession,
  resolveAppSessionPlan,
  restoreAppSocialSession,
} from '@/lib/app-social-session';
import { resolveAppConnectRoute } from '@/lib/app-session-sponsor';
import {
  sessionPendingFeedback,
  txToastSession,
} from '@/lib/transaction-toast-copy';
import {
  accountNeedsAppSessionSponsor,
  resolveAppSessionKeyAllowanceYocto,
} from '@/lib/welcome-near';
import { clearAppGatewayAuth } from '@/lib/app-gateway-auth';
import { invalidateAppSocialSessionCache } from '@/lib/app-social-session-cache';
import { isWalletUserCancellation } from '@/lib/wallet-errors';

/**
 * The picker just connected an account. Callers stop before signing so the
 * sheet can review that account. The next request uses the connected wallet.
 */
export class WalletConnectedReviewError extends Error {
  readonly accountId: string;

  constructor(accountId: string) {
    super('Review this account, then confirm.');
    this.name = 'WalletConnectedReviewError';
    this.accountId = accountId;
  }
}
import {
  createE2eMockWallet,
  readE2eAuthSessionEnabled,
  readE2eMockSignerEnabled,
} from '@/lib/e2e-mock-signer';
import { readE2eWalletAccountId } from '@/lib/e2e-wallet-account';
import { APP_WALLET_ACCOUNT_KEY } from '@/lib/gate-return';

const WALLET_ACCOUNT_EVENT = 'onsocial:wallet-account';

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
  /** Session setup card. One toast, shared with transaction feedback. */
  sessionFeedback: TransactionFeedback | null;
  clearSessionFeedback: () => void;
  connect: () => Promise<void>;
  /**
   * Restore / renew / bootstrap the OnSocial session.
   * - `renewIfExpired` (default true): reuse the same key after the 90-day TTL
   * - `bootstrapIfMissing` (default true): AddKey when no session exists
   * Quiet drawer auto-restore should pass both false so Remove access cannot
   * immediately re-open the wallet.
   */
  resumeSocialSession: (options?: {
    renewIfExpired?: boolean;
    bootstrapIfMissing?: boolean;
  }) => Promise<boolean>;
  /** Drop local session flags after an on-chain revoke (or forced clear). */
  clearSocialSessionLocal: () => void;
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

function subscribeStoredWalletAccount(onChange: () => void): () => void {
  window.addEventListener('storage', onChange);
  window.addEventListener(WALLET_ACCOUNT_EVENT, onChange);
  return () => {
    window.removeEventListener('storage', onChange);
    window.removeEventListener(WALLET_ACCOUNT_EVENT, onChange);
  };
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
  window.dispatchEvent(new Event(WALLET_ACCOUNT_EVENT));
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

/**
 * Long enough to approve a prompt on a phone, short enough that a hung
 * sign-in does not pin every later request until reload.
 */
const WALLET_PICKER_TIMEOUT_MS = 120_000;

const WALLET_PICKER_TIMEOUT_MESSAGE = 'The wallet took too long. Try again.';

function sameWalletAccount(left: string | null, right: string | null): boolean {
  if (!left || !right) return left === right;
  return left.toLowerCase() === right.toLowerCase();
}

/**
 * One sign-in capture for every picker. A fresh sign-in uses the account
 * the wallet just returned, not a stored preference that may be a different
 * account on the same wallet.
 */
async function takeConnectedAccount(
  connector: NearConnector,
  networkName: typeof ACTIVE_NEAR_NETWORK,
  preferredAccountId: string | null,
  options: Parameters<NearConnector['connect']>[0] | undefined,
  isCancelled: () => boolean
): Promise<{ wallet: NearWalletBase; accountId: string } | null> {
  let signedInAccounts: Array<{ accountId: string }> = [];
  const captureSignIn = (event: { accounts: Array<{ accountId: string }> }) => {
    signedInAccounts = event.accounts;
  };
  connector.once('wallet:signIn', captureSignIn);
  try {
    const connectedWallet = await connector.connect(options ?? {});
    if (isCancelled()) return null;
    const accounts =
      signedInAccounts.length > 0
        ? signedInAccounts
        : await connectedWallet.getAccounts({ network: networkName });
    if (isCancelled()) return null;
    const accountId = pickRestoredAccountId(accounts, preferredAccountId, {
      freshSignIn: signedInAccounts.length > 0,
    });
    if (!accountId) {
      throw new Error('Select a wallet account and try again.');
    }
    return { wallet: connectedWallet, accountId };
  } finally {
    connector.off('wallet:signIn', captureSignIn);
  }
}

async function resolveBundledAppConnect(
  storedHint: string | null,
  forcePicker: boolean
) {
  if (forcePicker || !storedHint) return null;

  const plan = await resolveAppSessionPlan(storedHint);
  const needsSponsor = plan.sessionReady
    ? false
    : await accountNeedsAppSessionSponsor(storedHint);
  const route = resolveAppConnectRoute({
    forcePicker,
    hasStoredHint: true,
    alreadyConnected: false,
    sessionReady: plan.sessionReady,
    needsSponsor,
    hasPendingKey: Boolean(plan.pendingSessionKey),
  });
  if (!route.bundleSessionKey || !plan.pendingSessionKey) return null;

  const allowanceYocto = await resolveAppSessionKeyAllowanceYocto(storedHint);
  const options = appSessionConnectOptions(
    plan.pendingSessionKey,
    allowanceYocto
  );
  if (!options) return null;
  return { pendingSessionKey: plan.pendingSessionKey, options };
}

const AppWalletContext = createContext<AppWalletContextType>({
  accountId: null,
  isConnected: false,
  isLoading: true,
  hasSocialSession: false,
  isBootstrappingSession: false,
  sessionFeedback: null,
  clearSessionFeedback: () => {},
  connect: async () => {},
  resumeSocialSession: async () => false,
  clearSocialSessionLocal: () => {},
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
  const storedAccountId = useSyncExternalStore(
    subscribeStoredWalletAccount,
    readStoredWalletAccountId,
    () => null
  );
  const [liveAccountId, setAccountId] = useState<string | null | undefined>(
    undefined
  );
  const resolvedAccountId =
    liveAccountId === undefined ? storedAccountId : liveAccountId;
  const [isLoading, setIsLoading] = useState(true);
  const [hasSocialSession, setHasSocialSession] = useState(false);
  const [isBootstrappingSession, setIsBootstrappingSession] = useState(false);
  const [sessionFeedback, setSessionFeedback] =
    useState<TransactionFeedback | null>(null);
  const connectorRef = useRef<NearConnector | null>(null);
  const connectPromiseRef = useRef<Promise<void> | null>(null);
  /** One bootstrap at a time — AddKey must reuse the same pending key. */
  const bootstrapPromiseRef = useRef<Promise<boolean> | null>(null);
  const bootstrappingAccountRef = useRef<string | null>(null);
  /** First restore attempt finished, including a signed-out visit. */
  const walletInitDoneRef = useRef(false);
  /**
   * One in-flight picker for dock connect and signing. Keyed by the preferred
   * account so a later caller does not receive the previous account.
   */
  const pickerAttemptRef = useRef<{
    preferredAccountId: string | null;
    promise: Promise<{ wallet: NearWalletBase; accountId: string }>;
  } | null>(null);
  const network = ACTIVE_NEAR_NETWORK;

  const clearSessionFeedback = useCallback(() => {
    setSessionFeedback(null);
  }, []);

  const showSessionPending = useCallback(
    (phase: 'setup' | 'wallet' | 'confirming') => {
      setSessionFeedback(sessionPendingFeedback(phase));
    },
    []
  );

  const finishSessionFeedback = useCallback((ready: boolean) => {
    setHasSocialSession(ready);
    if (ready) {
      invalidateAppSocialSessionCache();
      setSessionFeedback({
        type: 'success',
        msg: txToastSession.ready,
      });
      return;
    }
    setSessionFeedback(null);
  }, []);

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
        let prompted = false;
        try {
          const ready = await bootstrapAppSocialSession(
            nextAccountId,
            (options) => connector.connect(options),
            {
              onFunding: () => {
                prompted = true;
                showSessionPending('setup');
              },
              onWalletPrompt: () => {
                prompted = true;
                showSessionPending('wallet');
              },
              onConfirming: () => {
                prompted = true;
                showSessionPending('confirming');
              },
            }
          );
          if (prompted) {
            finishSessionFeedback(ready);
          } else {
            setHasSocialSession(ready);
            if (ready) invalidateAppSocialSessionCache();
          }
          return ready;
        } catch (error) {
          if (isWalletUserCancellation(error)) {
            clearSessionFeedback();
          } else {
            console.warn('OnSocial session bootstrap failed', error);
            setSessionFeedback({
              type: 'error',
              msg: txToastSession.failed,
            });
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
    [clearSessionFeedback, finishSessionFeedback, showSessionPending]
  );

  /** Page-load / reconnect — restore only, never open AddKey. */
  const restoreSocialSessionQuietly = useCallback(
    async (nextAccountId: string): Promise<boolean> => {
      try {
        const session = await restoreAppSocialSession(nextAccountId);
        const ready = Boolean(session);
        setHasSocialSession(ready);
        if (ready) {
          invalidateAppSocialSessionCache();
        }
        return ready;
      } catch (error) {
        if (!isWalletUserCancellation(error)) {
          console.warn('OnSocial session restore failed', error);
        }
        setHasSocialSession(false);
        return false;
      }
    },
    []
  );

  useEffect(() => {
    const e2eAccount = readE2eWalletAccountId();
    if (e2eAccount) {
      walletInitDoneRef.current = true;
      setAccountId(e2eAccount);
      setIsLoading(false);
      if (readE2eAuthSessionEnabled()) {
        void restoreAppSocialSession(e2eAccount)
          .then((session) => setHasSocialSession(Boolean(session)))
          .catch(() => setHasSocialSession(false));
      }
      return;
    }

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
        // Explicit connect/Allow owns AddKey. Sign-in from refresh must not.
        if (bootstrappingAccountRef.current === nextAccountId) return;
        void restoreSocialSessionQuietly(nextAccountId);
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
            void restoreSocialSessionQuietly(nextAccountId);
          }
        }
      } catch {
        // not signed in
      } finally {
        if (!cancelled) {
          walletInitDoneRef.current = true;
          setIsLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
      connector.removeAllListeners();
    };
  }, [ensureSocialSession, network, restoreSocialSessionQuietly]);

  const openPicker = useCallback(
    async (
      preferredAccountId: string | null,
      options?: Parameters<NearConnector['connect']>[0]
    ): Promise<{ wallet: NearWalletBase; accountId: string }> => {
      const current = pickerAttemptRef.current;
      if (
        current &&
        sameWalletAccount(current.preferredAccountId, preferredAccountId)
      ) {
        return current.promise;
      }
      if (current) {
        await current.promise.catch(() => undefined);
      }

      const connector = connectorRef.current;
      if (!connector) {
        throw new Error('Wallet is still loading. Try again in a moment.');
      }

      const again = pickerAttemptRef.current;
      if (
        again &&
        sameWalletAccount(again.preferredAccountId, preferredAccountId)
      ) {
        return again.promise;
      }

      let timedOut = false;
      const attempt: {
        preferredAccountId: string | null;
        promise: Promise<{ wallet: NearWalletBase; accountId: string }>;
      } = {
        preferredAccountId,
        promise: Promise.resolve({
          wallet: null as unknown as NearWalletBase,
          accountId: '',
        }),
      };

      const picked = takeConnectedAccount(
        connector,
        network,
        preferredAccountId,
        options,
        () => timedOut
      );

      const promise = new Promise<{
        wallet: NearWalletBase;
        accountId: string;
      }>((resolve, reject) => {
        const timer = setTimeout(() => {
          timedOut = true;
          if (pickerAttemptRef.current === attempt) {
            pickerAttemptRef.current = null;
          }
          reject(new Error(WALLET_PICKER_TIMEOUT_MESSAGE));
        }, WALLET_PICKER_TIMEOUT_MS);

        picked.then(
          (value) => {
            clearTimeout(timer);
            if (timedOut || !value) return;
            resolve(value);
          },
          (error) => {
            clearTimeout(timer);
            if (timedOut) return;
            reject(error);
          }
        );
      });

      attempt.promise = promise;
      pickerAttemptRef.current = attempt;
      void promise
        .finally(() => {
          if (pickerAttemptRef.current === attempt) {
            pickerAttemptRef.current = null;
          }
        })
        .catch(() => undefined);
      return promise;
    },
    [network]
  );

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
        resolvedAccountId ?? readStoredWalletAccountId()
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

    const storedHint = readStoredWalletAccountId();
    const connectPromise = (async () => {
      const bundled = await resolveBundledAppConnect(storedHint, false);
      if (bundled) {
        setIsBootstrappingSession(true);
        showSessionPending('wallet');
      }

      const joining = Boolean(
        pickerAttemptRef.current &&
          sameWalletAccount(
            pickerAttemptRef.current.preferredAccountId,
            storedHint
          )
      );

      try {
        const { wallet: connectedWallet, accountId: nextAccountId } =
          await openPicker(
            storedHint,
            joining ? undefined : (bundled?.options ?? {})
          );

        setWallet(connectedWallet);
        setAccountId(nextAccountId);
        writeStoredWalletAccountId(nextAccountId);

        if (!joining && bundled && nextAccountId === storedHint) {
          showSessionPending('confirming');
          await completeAppSessionAfterConnect(
            nextAccountId,
            bundled.pendingSessionKey
          );
          const session = await restoreAppSocialSession(nextAccountId);
          finishSessionFeedback(Boolean(session));
          return;
        }

        await ensureSocialSession(nextAccountId);
      } catch (error) {
        if (bundled) {
          if (isWalletUserCancellation(error)) {
            clearSessionFeedback();
          } else if (
            !(
              error instanceof Error &&
              error.message.startsWith('Select a wallet account')
            )
          ) {
            console.warn('OnSocial session bootstrap failed', error);
            setSessionFeedback({
              type: 'error',
              msg: txToastSession.failed,
            });
          } else {
            clearSessionFeedback();
          }
        }
        if (isWalletUserCancellation(error)) return;
        throw error;
      } finally {
        if (bundled) setIsBootstrappingSession(false);
      }
    })().finally(() => {
      connectPromiseRef.current = null;
    });

    connectPromiseRef.current = connectPromise;
    await connectPromise;
  }, [
    resolvedAccountId,
    clearSessionFeedback,
    ensureSocialSession,
    finishSessionFeedback,
    openPicker,
    showSessionPending,
  ]);

  const switchWallet = useCallback(async () => {
    const connector = connectorRef.current;
    if (!connector) return;
    if (connectPromiseRef.current) {
      await connectPromiseRef.current;
      return;
    }

    const connectPromise = (async () => {
      // Skip reuse of the current connection so the picker always opens.
      const { wallet: connectedWallet, accountId: nextAccountId } =
        await openPicker(null, {});

      const previousAccountId = resolvedAccountId;
      setWallet(connectedWallet);
      setAccountId(nextAccountId);
      writeStoredWalletAccountId(nextAccountId);
      if (
        previousAccountId &&
        previousAccountId.toLowerCase() !== nextAccountId.toLowerCase()
      ) {
        clearAppGatewayAuth(previousAccountId);
      }
      await ensureSocialSession(nextAccountId);
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
  }, [resolvedAccountId, ensureSocialSession, openPicker]);

  const disconnect = useCallback(async () => {
    const connector = connectorRef.current;
    if (!connector) return;
    const previousAccountId = resolvedAccountId;
    await connector.disconnect();
    setWallet(null);
    setAccountId(null);
    setHasSocialSession(false);
    writeStoredWalletAccountId(null);
    invalidateAppSocialSessionCache();
    clearAppGatewayAuth(previousAccountId);
  }, [resolvedAccountId]);

  const clearSocialSessionLocal = useCallback(() => {
    setHasSocialSession(false);
    invalidateAppSocialSessionCache();
    clearAppGatewayAuth(resolvedAccountId);
  }, [resolvedAccountId]);

  const getSigningWallet = useCallback(async (): Promise<SigningWallet> => {
    const e2eAccount = readE2eWalletAccountId();
    if (
      e2eAccount &&
      (readE2eMockSignerEnabled() || readE2eAuthSessionEnabled())
    ) {
      return {
        wallet: createE2eMockWallet(e2eAccount),
        accountId: e2eAccount,
      };
    }

    const connector = connectorRef.current;
    if (!connector) {
      throw new Error('Wallet is still loading. Try again in a moment.');
    }

    // A call that started during restore still throws, even if restore
    // finishes while this attempt is waiting.
    const initDone = walletInitDoneRef.current;
    const preferredAccountId = resolvedAccountId ?? readStoredWalletAccountId();

    try {
      const { wallet: connectedWallet, accounts } =
        await connector.getConnectedWallet();
      const pickedAccountId = pickRestoredAccountId(
        accounts,
        preferredAccountId
      );
      if (connectedWallet && pickedAccountId) {
        setWallet(connectedWallet);
        setAccountId(pickedAccountId);
        writeStoredWalletAccountId(pickedAccountId);
        return { wallet: connectedWallet, accountId: pickedAccountId };
      }
    } catch {
      if (!initDone) {
        throw new Error('Wallet is still loading. Try again in a moment.');
      }
    }

    const { wallet: connectedWallet, accountId: pickedAccountId } =
      await openPicker(preferredAccountId);
    setWallet(connectedWallet);
    setAccountId(pickedAccountId);
    writeStoredWalletAccountId(pickedAccountId);
    throw new WalletConnectedReviewError(pickedAccountId);
  }, [resolvedAccountId, openPicker]);

  const resumeSocialSession = useCallback(
    async (options?: {
      renewIfExpired?: boolean;
      bootstrapIfMissing?: boolean;
    }): Promise<boolean> => {
      const renewIfExpired = options?.renewIfExpired !== false;
      const bootstrapIfMissing = options?.bootstrapIfMissing !== false;
      const nextAccountId = resolvedAccountId ?? readStoredWalletAccountId();
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
        // Fall through when restore cannot verify.
      }

      if (renewIfExpired) {
        try {
          if (
            (await getAppSocialSessionLifecycle(nextAccountId)) === 'expired'
          ) {
            setIsBootstrappingSession(true);
            try {
              const { wallet, accountId: signerId } = await getSigningWallet();
              const renew = await renewAppSocialSession({
                accountId: signerId,
                wallet,
              });
              setHasSocialSession(renew.ready);
              if (renew.ready) {
                invalidateAppSocialSessionCache();
              }
              return renew.ready;
            } finally {
              setIsBootstrappingSession(false);
            }
          }
        } catch (error) {
          if (!isWalletUserCancellation(error)) {
            console.warn('OnSocial session renew failed', error);
          }
          setHasSocialSession(false);
          return false;
        }
      }

      if (!bootstrapIfMissing) {
        setHasSocialSession(false);
        return false;
      }

      return ensureSocialSession(nextAccountId);
    },
    [resolvedAccountId, ensureSocialSession, getSigningWallet]
  );

  return (
    <AppWalletContext.Provider
      value={{
        accountId: resolvedAccountId,
        isConnected: Boolean(resolvedAccountId),
        isLoading,
        hasSocialSession,
        isBootstrappingSession,
        sessionFeedback,
        clearSessionFeedback,
        connect,
        resumeSocialSession,
        clearSocialSessionLocal,
        switchWallet,
        disconnect,
        getSigningWallet,
      }}
    >
      {children}
    </AppWalletContext.Provider>
  );
}
