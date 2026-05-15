import type { BroadcastTarget } from '../../types.js';
import type { BroadcastGetter } from '../../internal/session-bridge.js';

export const ONE_YOCTO_NEAR = '1';

export interface ScarcesRelayOptions {
  broadcast?: BroadcastTarget;
  wait: true;
  depositYocto?: string;
}

export function scarcesRelayOptions(
  getBroadcast?: BroadcastGetter,
  opts: { confirmation?: boolean; depositYocto?: string } = {}
): ScarcesRelayOptions {
  const broadcast = getBroadcast?.();
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
