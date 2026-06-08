import 'server-only';

import {
  createConfiguredNearRpc,
  createNearRpcRegistry,
  type Network,
} from '@onsocial/rpc';

import { ACTIVE_NEAR_NETWORK } from '@/lib/near-network';

export const getServerNearRpc = createNearRpcRegistry((network: Network) =>
  createConfiguredNearRpc({
    network,
    publicOnly: false,
    timeoutMs: 8_000,
    maxRetries: 1,
  })
);

export function getActiveServerNearRpc() {
  return getServerNearRpc(ACTIVE_NEAR_NETWORK);
}
