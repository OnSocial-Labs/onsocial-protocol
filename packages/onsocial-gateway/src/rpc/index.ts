// Gateway RPC singleton — wraps @onsocial/rpc with pino logging
//
// Usage:
//   import { nearRpc, rpcQuery } from '../rpc/index.js';
//   const result = await rpcQuery<{ keys: ... }>({ request_type: '...', ... });

import {
  createNearRpc,
  resolveNearRpcUrl,
  type Network,
  type NearRpc,
  type NearRpcResponse,
} from '@onsocial/rpc';
import { config } from '../config/index.js';
import { logger } from '../logger.js';

const network = (config.nearNetwork as Network) || 'testnet';

/**
 * Shared NEAR RPC client for the gateway process.
 *
 * Primary:   NEAR_RPC_URL env var (Lava in production)
 * Secondary: Built-in per-network endpoint (automatic failover)
 */
export const nearRpc: NearRpc = createNearRpc({
  primaryUrl: resolveNearRpcUrl(network),
  network,
  onLog: (level, msg, meta) => {
    logger[level]({ ...meta, component: 'rpc' }, msg);
  },
});

/**
 * Execute a NEAR RPC `query` call (view_access_key_list, call_function, etc.)
 * with automatic retry and failover.
 *
 * @throws Error if both providers fail or the RPC returns an error.
 */
export async function rpcQuery<T = unknown>(
  params: Record<string, unknown>,
): Promise<T> {
  const response: NearRpcResponse<T> = await nearRpc.call<T>('query', params);
  if (response.error) {
    throw new Error(`RPC query failed: ${response.error.message}`);
  }
  return response.result as T;
}
