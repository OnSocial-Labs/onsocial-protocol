import type { BroadcastTarget } from '../../types.js';
import type { BroadcastGetter } from '../../internal/session-bridge.js';

export const ONE_YOCTO_NEAR = '1';

/**
 * Prepaid gas for hub admin / publish-access wallet calls (local storage only).
 * Matches Session's default — well under the wallet "300 TGas" banner.
 * Paid buys keep the wallet broadcast default (300 TGas) for nested receipts.
 */
export const SCARCES_APPS_WALLET_GAS = '100000000000000';

export interface ScarcesRelayOptions {
  broadcast?: BroadcastTarget;
  wait: true;
  depositYocto?: string;
}

export function scarcesRelayOptions(
  getBroadcast?: BroadcastGetter,
  opts: {
    confirmation?: boolean;
    depositYocto?: string;
    /** Override wallet prepaid gas (yoctoGas). */
    gas?: string | bigint;
  } = {}
): ScarcesRelayOptions {
  let broadcast = getBroadcast?.();
  if (
    opts.gas !== undefined &&
    broadcast &&
    typeof broadcast === 'object' &&
    broadcast.kind === 'wallet'
  ) {
    broadcast = { ...broadcast, gas: opts.gas };
  }
  const relayOptions: ScarcesRelayOptions = {
    ...(broadcast !== undefined && { broadcast }),
    wait: true,
  };
  if (opts.confirmation) {
    relayOptions.depositYocto = opts.depositYocto ?? ONE_YOCTO_NEAR;
  } else if (opts.depositYocto !== undefined) {
    relayOptions.depositYocto = opts.depositYocto;
  }
  return relayOptions;
}
