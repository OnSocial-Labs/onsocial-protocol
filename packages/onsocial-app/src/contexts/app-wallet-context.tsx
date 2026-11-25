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
import type {
  NearConnector_ConnectOptions,
  NearWalletBase,
} from '@hot-labs/near-connect';
import type { TransactionFeedback } from '@/components/ui/transaction-feedback-toast';
import { ACTIVE_NEAR_NETWORK } from '@/lib/app-config';
import {
  appSessionConnectOptions,
  bootstrapAppSocialSession,
  clearStoredPendingSessionKey,
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
import {
  isWalletUserCancellation,
  walletMismatchInfoMessage,
  WalletPickerTimeoutError,
} from '@/lib/wallet-errors';
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
  getSigningWallet: (opts?: {
    reviewAfterPicker?: boolean;
  }) => Promise<SigningWallet>;
  /**
   * Re-open the connector with options (e.g. addFunctionCallKey) — same
   * guarded picker as connect. A different account throws
   * WalletConnectedReviewError before session polling.
   */
  connectWithOptions: (
    options: NearConnector_ConnectOptions
  ) => Promise<unknown>;
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

function sameWalletAccount(left: string | null, right: string | null): boolean {
  if (!left || !right) return left === right;
  return left.toLowerCase() === right.toLowerCase();
}

/**
 * App-started connect() calls still awaiting return. near-connect emits
 * wallet:signIn before connect() returns, and reuses one wallet object per
 * manifest, so the object cannot tell one attempt from another.
 */
let unsettledAppConnects = 0;

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
  const signedInEvents: Array<{
    accounts: Array<{ accountId: string }>;
    wallet?: NearWalletBase;
  }> = [];
  const captureSignIn = (event: {
    accounts: Array<{ accountId: string }>;
    wallet?: NearWalletBase;
  }) => {
    if (isCancelled()) return;
    signedInEvents.push(event);
  };
  connector.on('wallet:signIn', captureSignIn);
  unsettledAppConnects += 1;
  try {
    const connectedWallet = await connector.connect(options ?? {});
    if (isCancelled()) return null;
    const matched = signedInEvents.filter(
      (event) => event.wallet === connectedWallet && event.accounts.length > 0
    );
    const freshAccounts = matched.at(-1)?.accounts;
    const accounts = freshAccounts?.length
      ? freshAccounts
      : await connectedWallet.getAccounts({ network: networkName });
    if (isCancelled()) return null;
    const accountId = pickRestoredAccountId(accounts, preferredAccountId, {
      freshSignIn: Boolean(freshAccounts?.length),
    });
    if (!accountId) {
      throw new Error('Select a wallet account and try again.');
    }
    return { wallet: connectedWallet, accountId };
  } finally {
    unsettledAppConnects -= 1;
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
  connectWithOptions: async () => {
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
    generation: number;
  } | null>(null);
  const pickerGenerationRef = useRef(0);
  /** Wallet accepted by the latest attempt. Stale sign-ins belong to another. */
  const acceptedWalletRef = useRef<NearWalletBase | null>(null);
  /**
   * Latest guarded picker. Session bootstrap calls this so its identity
   * stays stable and the wallet listener is not torn down on each account.
   */
  const connectForAcceptedAccountRef = useRef<
    (
      options?: NearConnector_ConnectOptions,
      expectedAccountId?: string | null
    ) => Promise<NearWalletBase>
  >(async () => {
    throw new Error('Wallet is still loading. Try again in a moment.');
  });
  const network = ACTIVE_NEAR_NETWORK;

  const clearSessionFeedback = useCallback(() => {
    setSessionFeedback(null);
  }, []);

  /**
   * Latest Connect / resume — cancel and timeout toasts call this so the
   * action never closes over a stale callback.
   */
  const sessionRetryRef = useRef<() => void>(() => {});

  const sessionRecoverFeedback = useCallback(
    (type: 'info' | 'error', msg: string): TransactionFeedback => ({
      type,
      msg,
      actionLabel: txToastSession.tryAgain,
      onAction: () => sessionRetryRef.current(),
    }),
    []
  );

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
            (options) =>
              connectForAcceptedAccountRef.current(options, nextAccountId),
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
          if (error instanceof WalletPickerTimeoutError) {
            setSessionFeedback(
              sessionRecoverFeedback('error', txToastSession.timedOut)
            );
            setHasSocialSession(false);
            throw error;
          }
          if (error instanceof WalletConnectedReviewError) {
            clearSessionFeedback();
            setHasSocialSession(false);
            throw error;
          }
          if (isWalletUserCancellation(error)) {
            // Dismissed the AddKey sheet — info + retry, not a red failure.
            if (prompted) {
              setSessionFeedback(
                sessionRecoverFeedback('info', txToastSession.canceled)
              );
            } else {
              clearSessionFeedback();
            }
          } else {
            console.warn('OnSocial session bootstrap failed', error);
            setSessionFeedback(
              sessionRecoverFeedback('error', txToastSession.failed)
            );
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
    [
      clearSessionFeedback,
      finishSessionFeedback,
      sessionRecoverFeedback,
      showSessionPending,
    ]
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
      if (unsettledAppConnects > 0) return;
      if (pickerAttemptRef.current) return;
      const accepted = acceptedWalletRef.current;
      if (accepted && event.wallet && event.wallet !== accepted) return;
      const nextAccountId = event.accounts[0]?.accountId ?? null;
      acceptedWalletRef.current = event.wallet ?? null;
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
      acceptedWalletRef.current = null;
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
          acceptedWalletRef.current = nextAccountId ? connectedWallet : null;
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
      for (;;) {
        const current = pickerAttemptRef.current;
        if (
          current &&
          sameWalletAccount(current.preferredAccountId, preferredAccountId)
        ) {
          return current.promise;
        }
        if (current) {
          // Cancel / timeout of the open sheet settles waiters too — do not
          // quietly open a second, unchecked picker behind the same dismiss.
          try {
            await current.promise;
          } catch (error) {
            if (isWalletUserCancellation(error)) throw error;
          }
          continue;
        }

        const connector = connectorRef.current;
        if (!connector) {
          throw new Error('Wallet is still loading. Try again in a moment.');
        }
        if (pickerAttemptRef.current) continue;

        const generation = ++pickerGenerationRef.current;
        let timedOut = false;
        let resolvePromise: (value: {
          wallet: NearWalletBase;
          accountId: string;
        }) => void = () => {};
        let rejectPromise: (reason?: unknown) => void = () => {};
        const promise = new Promise<{
          wallet: NearWalletBase;
          accountId: string;
        }>((resolve, reject) => {
          resolvePromise = resolve;
          rejectPromise = reject;
        });
        const attempt = { preferredAccountId, promise, generation };
        pickerAttemptRef.current = attempt;

        const timer = setTimeout(() => {
          timedOut = true;
          if (pickerAttemptRef.current === attempt) {
            pickerAttemptRef.current = null;
          }
          if (pickerGenerationRef.current === generation) {
            setSessionFeedback(
              sessionRecoverFeedback('error', txToastSession.timedOut)
            );
          }
          rejectPromise(new WalletPickerTimeoutError(txToastSession.timedOut));
        }, WALLET_PICKER_TIMEOUT_MS);

        void takeConnectedAccount(
          connector,
          network,
          preferredAccountId,
          options,
          () => pickerGenerationRef.current !== generation
        ).then(
          (value) => {
            clearTimeout(timer);
            if (pickerGenerationRef.current !== generation || !value) return;
            if (timedOut) {
              // Attempt is dead. Late match adopts quietly; anything else
              // announces "Now using @y" and drops the leftover pending key.
              const matchesPreferred = sameWalletAccount(
                preferredAccountId,
                value.accountId
              );
              if (preferredAccountId && !matchesPreferred) {
                clearStoredPendingSessionKey(preferredAccountId);
              }
              acceptedWalletRef.current = value.wallet;
              setWallet(value.wallet);
              setAccountId(value.accountId);
              writeStoredWalletAccountId(value.accountId);
              if (preferredAccountId && matchesPreferred) {
                setSessionFeedback((notice) =>
                  notice?.msg === txToastSession.timedOut ? null : notice
                );
                void restoreSocialSessionQuietly(value.accountId);
                return;
              }
              setSessionFeedback({
                type: 'info',
                ...walletMismatchInfoMessage(
                  value.accountId,
                  preferredAccountId ? 'Connect' : 'Switch'
                ),
              });
              return;
            }
            acceptedWalletRef.current = value.wallet;
            resolvePromise(value);
          },
          (error) => {
            clearTimeout(timer);
            if (pickerGenerationRef.current !== generation || timedOut) return;
            rejectPromise(error);
          }
        );

        void promise
          .finally(() => {
            if (pickerAttemptRef.current === attempt) {
              pickerAttemptRef.current = null;
            }
          })
          .catch(() => undefined);
        return promise;
      }
    },
    [network, restoreSocialSessionQuietly, sessionRecoverFeedback]
  );

  const connectForAcceptedAccount = useCallback(
    async (
      options?: NearConnector_ConnectOptions,
      expectedAccountId?: string | null
    ): Promise<NearWalletBase> => {
      const preferredAccountId =
        expectedAccountId ?? resolvedAccountId ?? readStoredWalletAccountId();
      const previousWallet = acceptedWalletRef.current;
      const { wallet, accountId: pickedAccountId } = await openPicker(
        preferredAccountId,
        options
      );
      if (
        preferredAccountId &&
        !sameWalletAccount(preferredAccountId, pickedAccountId)
      ) {
        acceptedWalletRef.current = previousWallet;
        throw new WalletConnectedReviewError(pickedAccountId);
      }
      acceptedWalletRef.current = wallet;
      setWallet(wallet);
      if (!preferredAccountId) {
        setAccountId(pickedAccountId);
        writeStoredWalletAccountId(pickedAccountId);
      }
      return wallet;
    },
    [openPicker, resolvedAccountId]
  );
  connectForAcceptedAccountRef.current = connectForAcceptedAccount;

  /**
   * Create-wallet / hung picker: sign-in may land while connect() rejects as
   * cancel or timeout. Quiet restore alone would leave them connected with no
   * session key — continue AddKey for that account when the wallet is signed in.
   */
  const finishSessionAfterSignedInConnect = useCallback(async (): Promise<boolean> => {
    const connector = connectorRef.current;
    if (!connector) return false;
    try {
      const { wallet: connectedWallet, accounts } =
        await connector.getConnectedWallet();
      const nextAccountId = pickRestoredAccountId(
        accounts,
        readStoredWalletAccountId()
      );
      if (!connectedWallet || !nextAccountId) return false;
      acceptedWalletRef.current = connectedWallet;
      setWallet(connectedWallet);
      setAccountId(nextAccountId);
      writeStoredWalletAccountId(nextAccountId);
      if (await restoreAppSocialSession(nextAccountId)) {
        finishSessionFeedback(true);
        return true;
      }
      await ensureSocialSession(nextAccountId);
      return true;
    } catch {
      return false;
    }
  }, [ensureSocialSession, finishSessionFeedback]);

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
        acceptedWalletRef.current = connectedWallet;
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

      try {
        // Always pass this attempt's options. Joiners share the in-flight
        // promise; openPicker ignores a second options bag on join.
        const { wallet: connectedWallet, accountId: nextAccountId } =
          await openPicker(storedHint, bundled?.options ?? {});

        acceptedWalletRef.current = connectedWallet;
        setWallet(connectedWallet);
        setAccountId(nextAccountId);
        writeStoredWalletAccountId(nextAccountId);

        if (bundled && nextAccountId === storedHint) {
          showSessionPending('confirming');
          await completeAppSessionAfterConnect(
            nextAccountId,
            bundled.pendingSessionKey
          );
          const session = await restoreAppSocialSession(nextAccountId);
          finishSessionFeedback(Boolean(session));
          return;
        }

        // Mid-setup account change — drop the gas key for the account we left.
        if (bundled && storedHint) {
          clearStoredPendingSessionKey(storedHint);
        }

        await ensureSocialSession(nextAccountId);
      } catch (error) {
        if (error instanceof WalletPickerTimeoutError) {
          const continued = await finishSessionAfterSignedInConnect();
          if (!continued) {
            setSessionFeedback(
              sessionRecoverFeedback('error', txToastSession.timedOut)
            );
          }
          return;
        }
        if (error instanceof WalletConnectedReviewError) {
          clearSessionFeedback();
          return;
        }
        if (bundled) {
          if (isWalletUserCancellation(error)) {
            setSessionFeedback(
              sessionRecoverFeedback('info', txToastSession.canceled)
            );
          } else if (
            !(
              error instanceof Error &&
              error.message.startsWith('Select a wallet account')
            )
          ) {
            console.warn('OnSocial session bootstrap failed', error);
            setSessionFeedback(
              sessionRecoverFeedback('error', txToastSession.failed)
            );
          } else {
            clearSessionFeedback();
          }
        } else if (isWalletUserCancellation(error)) {
          clearSessionFeedback();
        }
        if (isWalletUserCancellation(error)) {
          // Create approve + dismiss: wallet signed in, connect rejected — open AddKey.
          await finishSessionAfterSignedInConnect();
          return;
        }
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
    finishSessionAfterSignedInConnect,
    finishSessionFeedback,
    openPicker,
    sessionRecoverFeedback,
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
      acceptedWalletRef.current = connectedWallet;
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
        if (error instanceof WalletPickerTimeoutError) {
          // Switch is not session setup — don't offer Connect/resume retry.
          setSessionFeedback({
            type: 'error',
            msg: txToastSession.timedOut,
          });
          return;
        }
        if (
          error instanceof WalletConnectedReviewError ||
          isWalletUserCancellation(error)
        ) {
          clearSessionFeedback();
          return;
        }
        throw error;
      })
      .finally(() => {
        connectPromiseRef.current = null;
      });

    connectPromiseRef.current = connectPromise;
    await connectPromise;
  }, [clearSessionFeedback, resolvedAccountId, ensureSocialSession, openPicker]);

  const disconnect = useCallback(async () => {
    const connector = connectorRef.current;
    if (!connector) return;
    const previousAccountId = resolvedAccountId;
    await connector.disconnect();
    acceptedWalletRef.current = null;
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

  const getSigningWallet = useCallback(
    async (opts?: { reviewAfterPicker?: boolean }): Promise<SigningWallet> => {
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
      const preferredAccountId =
        resolvedAccountId ?? readStoredWalletAccountId();

      try {
        const { wallet: connectedWallet, accounts } =
          await connector.getConnectedWallet();
        const pickedAccountId = pickRestoredAccountId(
          accounts,
          preferredAccountId
        );
        if (connectedWallet && pickedAccountId) {
          acceptedWalletRef.current = connectedWallet;
          setWallet(connectedWallet);
          setAccountId(pickedAccountId);
          writeStoredWalletAccountId(pickedAccountId);
          if (
            preferredAccountId &&
            !sameWalletAccount(preferredAccountId, pickedAccountId)
          ) {
            throw new WalletConnectedReviewError(pickedAccountId);
          }
          return { wallet: connectedWallet, accountId: pickedAccountId };
        }
      } catch (error) {
        if (error instanceof WalletConnectedReviewError) throw error;
        if (!initDone) {
          throw new Error('Wallet is still loading. Try again in a moment.');
        }
      }

      const { wallet: connectedWallet, accountId: pickedAccountId } =
        await openPicker(preferredAccountId);
      acceptedWalletRef.current = connectedWallet;
      setWallet(connectedWallet);
      setAccountId(pickedAccountId);
      writeStoredWalletAccountId(pickedAccountId);
      const mismatched = Boolean(
        preferredAccountId &&
          !sameWalletAccount(preferredAccountId, pickedAccountId)
      );
      if (opts?.reviewAfterPicker || mismatched) {
        throw new WalletConnectedReviewError(pickedAccountId);
      }
      return { wallet: connectedWallet, accountId: pickedAccountId };
    },
    [resolvedAccountId, openPicker]
  );

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
              if (!connectorRef.current) return false;
              const ready = await renewAppSocialSession({
                accountId: nextAccountId,
                connectWithOptions: (options) =>
                  connectForAcceptedAccount(options, nextAccountId),
              });
              setHasSocialSession(ready);
              if (ready) {
                invalidateAppSocialSessionCache();
              }
              return ready;
            } finally {
              setIsBootstrappingSession(false);
            }
          }
        } catch (error) {
          if (error instanceof WalletConnectedReviewError) {
            setHasSocialSession(false);
            throw error;
          }
          if (isWalletUserCancellation(error)) {
            setSessionFeedback(
              sessionRecoverFeedback('info', txToastSession.canceled)
            );
          } else {
            console.warn('OnSocial session renew failed', error);
            setSessionFeedback(
              sessionRecoverFeedback('error', txToastSession.failed)
            );
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
    [
      connectForAcceptedAccount,
      resolvedAccountId,
      ensureSocialSession,
      sessionRecoverFeedback,
    ]
  );

  const connectWithOptions = useCallback(
    (options: NearConnector_ConnectOptions) =>
      connectForAcceptedAccount(options),
    [connectForAcceptedAccount]
  );

  sessionRetryRef.current = () => {
    clearSessionFeedback();
    if (resolvedAccountId ?? readStoredWalletAccountId()) {
      void resumeSocialSession();
      return;
    }
    void connect();
  };

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
        connectWithOptions,
      }}
    >
      {children}
    </AppWalletContext.Provider>
  );
}
