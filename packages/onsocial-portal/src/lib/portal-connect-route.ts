/**
 * How portal connect asks for the session key.
 *
 * The welcome drip is signed by the sponsor. The session key is signed by the
 * user. Those are two signers, so they cannot be one NEAR transaction. A known
 * funded account approves the key inside the first wallet connect. An empty
 * account connects first so the gift has a destination, then approves once.
 */

export interface PortalConnectRouteInput {
  forcePicker: boolean;
  hasStoredHint: boolean;
  alreadyConnected: boolean;
  sessionReady: boolean;
  needsWelcomeNear: boolean;
  hasPendingKey: boolean;
}

export type PortalConnectOpeningToast = 'none' | 'setup' | 'wallet';

export interface PortalConnectRoute {
  /** Attach addFunctionCallKey to the account-picker connect. */
  bundleSessionKey: boolean;
  /**
   * Toast before the next wallet sheet.
   * `none` — the sheet is only the wallet's account picker.
   * `setup` — welcome NEAR is in flight (chain phase).
   * `wallet` — the next sheet is the session key (wallet phase).
   */
  openingToast: PortalConnectOpeningToast;
}

export interface PortalSessionPendingToast {
  pendingPhase: 'wallet' | 'chain';
  pendingMessage: 'settingUpSession' | 'approveInWallet';
}

/** Known account, key still needed, balance already covers AddKey. */
export function portalConnectCanBundleSessionKey(input: {
  sessionReady: boolean;
  needsWelcomeNear: boolean;
  hasPendingKey: boolean;
}): boolean {
  return !input.sessionReady && input.hasPendingKey && !input.needsWelcomeNear;
}

export function resolvePortalConnectRoute(
  input: PortalConnectRouteInput
): PortalConnectRoute {
  if (input.sessionReady || !input.hasPendingKey) {
    return { bundleSessionKey: false, openingToast: 'none' };
  }

  if (input.alreadyConnected) {
    return {
      bundleSessionKey: false,
      openingToast: input.needsWelcomeNear ? 'setup' : 'wallet',
    };
  }

  const bundleSessionKey =
    !input.forcePicker &&
    input.hasStoredHint &&
    portalConnectCanBundleSessionKey(input);

  return {
    bundleSessionKey,
    openingToast: bundleSessionKey ? 'wallet' : 'none',
  };
}

export function portalSessionToastForOpening(
  opening: PortalConnectOpeningToast
): PortalSessionPendingToast | null {
  if (opening === 'none') return null;
  if (opening === 'wallet') {
    return {
      pendingPhase: 'wallet',
      pendingMessage: 'approveInWallet',
    };
  }
  return {
    pendingPhase: 'chain',
    pendingMessage: 'settingUpSession',
  };
}

/**
 * After the wallet returns, keep "Approve in your wallet…" and switch the
 * eyebrow to Confirming. The setup sentence stays on the gift only.
 */
export function portalSessionToastAfterWalletApproval(): PortalSessionPendingToast {
  return {
    pendingPhase: 'chain',
    pendingMessage: 'approveInWallet',
  };
}
