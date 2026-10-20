import { isIgnorableWalletError } from '@/lib/wallet-errors';
import {
  portalSessionToastAfterWalletApproval,
  portalSessionToastForOpening,
  resolvePortalConnectRoute,
  type PortalSessionPendingToast,
} from '@/lib/portal-connect-route';

export interface PortalConnectAccount {
  accountId: string;
}

export interface PortalConnectSessionPlan<TKey> {
  sessionReady: boolean;
  pendingSessionKey?: TKey;
}

export type PortalSessionFeedback =
  | ({ type: 'pending' } & PortalSessionPendingToast)
  | { type: 'success'; message: 'sessionReady' }
  | { type: 'error'; message: 'sessionSetupFailed' };

export interface PortalSessionLoginHooks {
  onWalletPrompt: () => void;
  onConfirming: () => void;
}

export interface PortalConnectFlowDeps<
  TWallet,
  TKey extends { publicKey: string },
  TOptions,
> {
  storedHint: string | null;
  forcePicker?: boolean;
  tryReuseConnectedWallet: () => Promise<{
    wallet: TWallet;
    accountId: string;
  } | null>;
  resolveSessionPlan: (
    accountId: string
  ) => Promise<PortalConnectSessionPlan<TKey>>;
  accountNeedsWelcomeNearFunding: (accountId: string) => Promise<boolean>;
  sessionConnectOptions: (key: TKey) => TOptions | null;
  connect: (options: TOptions | null) => Promise<TWallet>;
  subscribeSignIn: (
    listener: (accounts: PortalConnectAccount[]) => void
  ) => () => void;
  getAccounts: (wallet: TWallet) => Promise<PortalConnectAccount[]>;
  pickAccountId: (
    accounts: PortalConnectAccount[],
    storedHint: string | null,
    freshSignIn: boolean
  ) => string | null;
  requestWelcomeNearIfNeeded: (accountId: string) => Promise<void>;
  finishSessionLogin: (
    accountId: string,
    pendingSessionKey: TKey,
    signInWelcome: Promise<void> | null,
    hooks: PortalSessionLoginHooks
  ) => Promise<void>;
  completeSession: (
    accountId: string,
    pendingSessionKey: TKey
  ) => Promise<void>;
  hasSession: (accountId: string) => Promise<boolean>;
  onConnected: (wallet: TWallet, accountId: string) => void;
  onFeedback: (feedback: PortalSessionFeedback | null) => void;
  onBootstrapping: (active: boolean) => void;
}

interface BundledConnect<TKey, TOptions> {
  pendingSessionKey: TKey;
  connectOptions: TOptions;
}

function pendingFeedback(
  step: 'setup' | 'wallet' | 'confirming'
): PortalSessionFeedback {
  const toast =
    step === 'confirming'
      ? portalSessionToastAfterWalletApproval()
      : portalSessionToastForOpening(step);
  if (!toast) {
    throw new Error('Session toast is missing.');
  }
  return { type: 'pending', ...toast };
}

async function needsWelcomeNearFunding<
  TWallet,
  TKey extends { publicKey: string },
  TOptions,
>(
  deps: PortalConnectFlowDeps<TWallet, TKey, TOptions>,
  accountId: string
): Promise<boolean> {
  try {
    return await deps.accountNeedsWelcomeNearFunding(accountId);
  } catch {
    return true;
  }
}

function reportSessionError<
  TWallet,
  TKey extends { publicKey: string },
  TOptions,
>(deps: PortalConnectFlowDeps<TWallet, TKey, TOptions>, error: unknown): void {
  if (isIgnorableWalletError(error)) {
    deps.onFeedback(null);
    return;
  }
  console.warn('OnSocial session setup failed after wallet connect', error);
  deps.onFeedback({ type: 'error', message: 'sessionSetupFailed' });
}

function isAccountSelectionError(error: unknown): boolean {
  return (
    error instanceof Error &&
    error.message.startsWith('Select a wallet account')
  );
}

async function publishSessionResult<
  TWallet,
  TKey extends { publicKey: string },
  TOptions,
>(
  deps: PortalConnectFlowDeps<TWallet, TKey, TOptions>,
  accountId: string
): Promise<void> {
  if (await deps.hasSession(accountId)) {
    deps.onFeedback({ type: 'success', message: 'sessionReady' });
    return;
  }
  deps.onFeedback(null);
}

async function bootstrapSession<
  TWallet,
  TKey extends { publicKey: string },
  TOptions,
>(
  deps: PortalConnectFlowDeps<TWallet, TKey, TOptions>,
  accountId: string,
  pendingSessionKey: TKey,
  signInWelcome: Promise<void> | null,
  options?: { alreadyBootstrapping?: boolean }
): Promise<void> {
  const needsWelcomeNear = await needsWelcomeNearFunding(deps, accountId);
  const route = resolvePortalConnectRoute({
    forcePicker: false,
    hasStoredHint: true,
    alreadyConnected: true,
    sessionReady: false,
    needsWelcomeNear,
    hasPendingKey: true,
  });
  const opening = portalSessionToastForOpening(route.openingToast);

  if (!options?.alreadyBootstrapping) {
    deps.onBootstrapping(true);
  }
  if (opening) {
    deps.onFeedback({ type: 'pending', ...opening });
  }

  try {
    await deps.finishSessionLogin(accountId, pendingSessionKey, signInWelcome, {
      onWalletPrompt: () => {
        deps.onFeedback(pendingFeedback('wallet'));
      },
      onConfirming: () => {
        deps.onFeedback(pendingFeedback('confirming'));
      },
    });
    await publishSessionResult(deps, accountId);
  } catch (error) {
    reportSessionError(deps, error);
  } finally {
    if (!options?.alreadyBootstrapping) {
      deps.onBootstrapping(false);
    }
  }
}

async function resolveBundledConnect<
  TWallet,
  TKey extends { publicKey: string },
  TOptions,
>(
  deps: PortalConnectFlowDeps<TWallet, TKey, TOptions>
): Promise<BundledConnect<TKey, TOptions> | null> {
  if (deps.forcePicker || !deps.storedHint) {
    return null;
  }

  const sessionPlan = await deps.resolveSessionPlan(deps.storedHint);
  const needsWelcomeNear =
    sessionPlan.sessionReady || !sessionPlan.pendingSessionKey
      ? false
      : await needsWelcomeNearFunding(deps, deps.storedHint);
  const route = resolvePortalConnectRoute({
    forcePicker: false,
    hasStoredHint: true,
    alreadyConnected: false,
    sessionReady: sessionPlan.sessionReady,
    needsWelcomeNear,
    hasPendingKey: Boolean(sessionPlan.pendingSessionKey),
  });

  if (!route.bundleSessionKey || !sessionPlan.pendingSessionKey) {
    return null;
  }

  const connectOptions = deps.sessionConnectOptions(
    sessionPlan.pendingSessionKey
  );
  if (!connectOptions) {
    return null;
  }

  return {
    pendingSessionKey: sessionPlan.pendingSessionKey,
    connectOptions,
  };
}

async function connectFreshWallet<
  TWallet,
  TKey extends { publicKey: string },
  TOptions,
>(
  deps: PortalConnectFlowDeps<TWallet, TKey, TOptions>
): Promise<{ wallet: TWallet; accountId: string }> {
  const bundled = await resolveBundledConnect(deps);
  let signedInAccounts: PortalConnectAccount[] = [];
  let signInWelcome: Promise<void> | null = null;
  const unsubscribe = deps.subscribeSignIn((accounts) => {
    signedInAccounts = accounts;
    const signedInAccountId = accounts[0]?.accountId;
    if (!signedInAccountId) return;
    if (bundled && signedInAccountId === deps.storedHint) return;
    signInWelcome = deps.requestWelcomeNearIfNeeded(signedInAccountId);
  });

  if (bundled) {
    deps.onBootstrapping(true);
    deps.onFeedback(pendingFeedback('wallet'));
  }

  try {
    let connectedWallet: TWallet;
    try {
      connectedWallet = await deps.connect(bundled?.connectOptions ?? null);
    } catch (error) {
      if (bundled) {
        reportSessionError(deps, error);
      }
      throw error;
    }

    try {
      const accounts =
        signedInAccounts.length > 0
          ? signedInAccounts
          : await deps.getAccounts(connectedWallet);
      const nextAccountId = deps.pickAccountId(
        accounts,
        deps.storedHint,
        signedInAccounts.length > 0
      );
      if (!nextAccountId) {
        throw new Error('Select a wallet account, then try again.');
      }

      deps.onConnected(connectedWallet, nextAccountId);

      if (bundled && nextAccountId === deps.storedHint) {
        deps.onFeedback(pendingFeedback('confirming'));
        try {
          await deps.completeSession(nextAccountId, bundled.pendingSessionKey);
          await publishSessionResult(deps, nextAccountId);
        } catch (error) {
          reportSessionError(deps, error);
        }
        return { wallet: connectedWallet, accountId: nextAccountId };
      }

      const sessionPlan = await deps.resolveSessionPlan(nextAccountId);
      if (!sessionPlan.sessionReady && sessionPlan.pendingSessionKey) {
        await bootstrapSession(
          deps,
          nextAccountId,
          sessionPlan.pendingSessionKey,
          signInWelcome,
          { alreadyBootstrapping: Boolean(bundled) }
        );
      } else if (bundled) {
        deps.onFeedback(null);
      }

      return { wallet: connectedWallet, accountId: nextAccountId };
    } catch (error) {
      if (bundled) {
        if (isAccountSelectionError(error)) {
          deps.onFeedback(null);
        } else {
          reportSessionError(deps, error);
        }
      }
      throw error;
    }
  } finally {
    unsubscribe();
    if (bundled) {
      deps.onBootstrapping(false);
    }
  }
}

/**
 * One user approval for the session key.
 * Funded known accounts bundle AddKey into the first connect. Everyone else
 * picks an account with no toast, then one card covers the gift and the key.
 */
export async function runPortalConnect<
  TWallet,
  TKey extends { publicKey: string },
  TOptions,
>(
  deps: PortalConnectFlowDeps<TWallet, TKey, TOptions>
): Promise<{ wallet: TWallet; accountId: string }> {
  if (!deps.forcePicker) {
    const existing = await deps.tryReuseConnectedWallet();
    if (existing) {
      const sessionPlan = await deps.resolveSessionPlan(existing.accountId);
      deps.onConnected(existing.wallet, existing.accountId);
      if (!sessionPlan.sessionReady && sessionPlan.pendingSessionKey) {
        await bootstrapSession(
          deps,
          existing.accountId,
          sessionPlan.pendingSessionKey,
          null
        );
      }
      return existing;
    }
  }

  return connectFreshWallet(deps);
}
