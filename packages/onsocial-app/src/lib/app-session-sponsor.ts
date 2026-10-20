/**
 * Session-key gas for a sponsored account.
 *
 * The welcome gift is a sponsor transfer, capped by the relayer at 0.025 NEAR
 * and topped up to about 0.015. A full 0.25 NEAR key allowance does not fit in
 * that gift, so an empty account gets a smaller allowance that does. An account
 * that can already lock 0.25 NEAR keeps the full allowance.
 *
 * The gift and the user's AddKey are two signers. They cannot be one
 * transaction. A known funded account approves the key inside the first
 * connect. An empty account connects first so the gift has a destination.
 */

export const FULL_SESSION_KEY_ALLOWANCE_YOCTO =
  250_000_000_000_000_000_000_000n;
/** Fits in the welcome top-up after account storage and the AddKey fee. */
export const SPONSORED_SESSION_KEY_ALLOWANCE_YOCTO =
  8_000_000_000_000_000_000_000n;
/** Liquid balance the backend treats as enough to skip another drip. */
export const WELCOME_NEAR_THRESHOLD_YOCTO = 13_000_000_000_000_000_000_000n;
const FULL_ALLOWANCE_HEADROOM_YOCTO = 5_000_000_000_000_000_000_000n;

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

  const bundleSessionKey =
    !input.forcePicker && input.hasStoredHint && !input.needsSponsor;

  return {
    bundleSessionKey,
    openingToast: bundleSessionKey ? 'wallet' : 'none',
  };
}
