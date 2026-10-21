/**
 * Public NEAR JSON-RPC for OnAPI keys.
 *
 * POST /v1/rpc
 *
 * One key, the same per-minute budget as GraphQL. The gateway's configured
 * network is the only chain (testnet in production today). Any account or
 * contract on that chain is allowed — this is not limited to OnSocial
 * contracts. Free keys can read recent state. A pinned block is archival
 * and stays on a paid tier. The node address is never returned; callers
 * reach this route only.
 */

import { Router } from 'express';
import type { Response } from 'express';
import {
  isHistoricalBlockQuery,
  type NearRpcResponse,
  type Network,
} from '@onsocial/rpc';
import { config } from '../config/index.js';
import { logger } from '../logger.js';
import { requireAuth } from '../middleware/index.js';
import { nearRpc } from '../rpc/index.js';
import type { AuthRequest, Tier } from '../types/index.js';

/** Methods a key may call. No debug or EXPERIMENTAL methods. */
export const PUBLIC_RPC_METHODS = [
  'query',
  'block',
  'tx',
  'broadcast_tx_async',
  'broadcast_tx_commit',
  'status',
  'gas_price',
] as const;

const PUBLIC_RPC_METHOD_SET: ReadonlySet<string> = new Set(PUBLIC_RPC_METHODS);

const ARCHIVAL_TIERS: ReadonlySet<Tier> = new Set(['pro', 'scale', 'service']);

export const ARCHIVAL_RPC_MESSAGE =
  'Archival RPC is a paid OnAPI tier. Free keys can read recent chain state only.';

export const rpcRouter = Router();

interface JsonRpcRequestBody {
  jsonrpc?: unknown;
  id?: unknown;
  method?: unknown;
  params?: unknown;
  network?: unknown;
}

function rpcId(id: unknown): string {
  if (typeof id === 'string' || typeof id === 'number') return String(id);
  return 'onsocial';
}

function rpcError(id: unknown, code: number, message: string): NearRpcResponse {
  return {
    jsonrpc: '2.0',
    id: rpcId(id),
    error: { code, message },
  };
}

/**
 * Client-side rejection before any upstream call.
 * `null` means the request may be forwarded.
 */
export function publicRpcRejection(
  tier: Tier,
  method: string,
  params: unknown,
  requestedNetwork: unknown,
  servedNetwork: Network
): { code: number; message: string } | null {
  if (
    requestedNetwork != null &&
    requestedNetwork !== '' &&
    requestedNetwork !== servedNetwork
  ) {
    return {
      code: -32602,
      message: `This RPC serves ${servedNetwork}.`,
    };
  }

  if (!PUBLIC_RPC_METHOD_SET.has(method)) {
    return {
      code: -32601,
      message: `RPC method not allowed: ${method}`,
    };
  }

  if (!ARCHIVAL_TIERS.has(tier) && isHistoricalBlockQuery(method, params)) {
    return { code: -32001, message: ARCHIVAL_RPC_MESSAGE };
  }

  return null;
}

rpcRouter.post('/', requireAuth, async (req: AuthRequest, res: Response) => {
  if (Array.isArray(req.body)) {
    res.json(rpcError('onsocial', -32600, 'JSON-RPC batch is not supported'));
    return;
  }

  if (req.body == null || typeof req.body !== 'object') {
    res.json(rpcError('onsocial', -32600, 'Invalid JSON-RPC request'));
    return;
  }

  const body = req.body as JsonRpcRequestBody;
  const method = typeof body.method === 'string' ? body.method.trim() : '';
  if (!method) {
    res.json(rpcError(body.id, -32600, 'Missing RPC method'));
    return;
  }

  const servedNetwork = (
    config.nearNetwork === 'mainnet' ? 'mainnet' : 'testnet'
  ) as Network;
  const tier = req.auth?.tier ?? 'free';
  const rejection = publicRpcRejection(
    tier,
    method,
    body.params,
    body.network,
    servedNetwork
  );
  if (rejection) {
    res.json(rpcError(body.id, rejection.code, rejection.message));
    return;
  }

  try {
    const response = await nearRpc.call(method, body.params ?? {});
    const payload: NearRpcResponse = {
      jsonrpc: '2.0',
      id: rpcId(body.id ?? response.id),
    };
    if (response.error) payload.error = response.error;
    else payload.result = response.result;
    res.json(payload);
  } catch (err) {
    logger.warn({ err, method }, 'public rpc upstream failed');
    res.status(503).json(rpcError(body.id, -32000, 'RPC upstream unavailable'));
  }
});
