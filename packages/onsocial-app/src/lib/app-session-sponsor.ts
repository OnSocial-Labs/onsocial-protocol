/**
 * Session-key gas for a sponsored account.
 *
 * The welcome gift is a sponsor transfer, capped by the relayer at 0.025 NEAR
 * and topped up to about 0.015. A full 0.25 NEAR key allowance does not fit in
 * that gift, so an empty account gets a smaller allowance that does. An account
 * that can already lock 0.25 NEAR keeps the full allowance.
 *
 * The gift and the user's AddKey are two signers. They cannot be one
 * transaction. A funded account approves the key inside the first connect,
 * including a first visit whose wallet already names that account. An empty
 * account connects first so the gift has a destination. A first visit whose
 * wallet will not name an account before sign-in also connects first.
 */

export const FULL_SESSION_KEY_ALLOWANCE_YOCTO =
  250_000_000_000_000_000_000_000n;
/** Fits in the welcome top-up after account storage and the AddKey fee. */
export const SPONSORED_SESSION_KEY_ALLOWANCE_YOCTO =
  8_000_000_000_000_000_000_000n;
/** Liquid balance the backend treats as enough to skip another drip. */
export const WELCOME_NEAR_THRESHOLD_YOCTO = 13_000_000_000_000_000_000_000n;
const FULL_ALLOWANCE_HEADROOM_YOCTO = 5_000_000_000_000_000_000_000n;
/**
 * Access-key storage plus AddKey gas. The gift leftover
 * (threshold − sponsored allowance) covers this. It does not cover the
 * old 100 TGas permission write.
 */
export const ADD_KEY_FEE_HEADROOM_YOCTO = 2_000_000_000_000_000_000_000n;
/** 100 TGas at the minimum gas price (10^8 yoctoNEAR per gas). */
export const PERMISSION_WRITE_GAS_YOCTO = 10_000_000_000_000_000_000_000n;

export function accountNeedsSessionSponsor(
  liquidYocto: bigint | null
): boolean {
  if (liquidYocto == null) return true;
  return liquidYocto < WELCOME_NEAR_THRESHOLD_YOCTO;
}

export function chooseSessionKeyAllowanceYocto(
  liquidYocto: bigint | null
): string {
  if (
    liquidYocto != null &&
    liquidYocto >=
      FULL_SESSION_KEY_ALLOWANCE_YOCTO + FULL_ALLOWANCE_HEADROOM_YOCTO
  ) {
    return FULL_SESSION_KEY_ALLOWANCE_YOCTO.toString();
  }
  return SPONSORED_SESSION_KEY_ALLOWANCE_YOCTO.toString();
}

export interface AppConnectRouteInput {
  forcePicker: boolean;
  hasStoredHint: boolean;
  alreadyConnected: boolean;
  sessionReady: boolean;
  needsSponsor: boolean;
  hasPendingKey: boolean;
}

export interface AppConnectRoute {
  bundleSessionKey: boolean;
  openingToast: 'none' | 'setup' | 'wallet';
}

export function resolveAppConnectRoute(
  input: AppConnectRouteInput
): AppConnectRoute {
  if (input.sessionReady || !input.hasPendingKey) {
    return { bundleSessionKey: false, openingToast: 'none' };
  }

  if (input.alreadyConnected) {
    return {
      bundleSessionKey: false,
      openingToast: input.needsSponsor ? 'setup' : 'wallet',
    };
  }

  // The drip and AddKey are different signers. Never bundle into an
  // unfunded sign-in, or into the switch-wallet picker. A funded account
  // bundles even on a first visit (no stored hint).
  const bundleSessionKey = !input.forcePicker && !input.needsSponsor;

  return {
    bundleSessionKey,
    openingToast: bundleSessionKey ? 'wallet' : 'none',
  };
}

/**
 * A returning connect lets the wallet list hide wallets that cannot add the
 * key during sign-in. A first visit has already picked a wallet, so that
 * wallet itself has to support the feature.
 */
export function walletMayBundleSessionKey(input: {
  hasStoredHint: boolean;
  walletSupportsFunctionCallKey: boolean;
}): boolean {
  if (input.hasStoredHint) return true;
  return input.walletSupportsFunctionCallKey;
}
