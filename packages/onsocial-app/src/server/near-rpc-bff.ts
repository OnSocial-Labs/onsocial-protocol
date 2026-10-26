import 'server-only';

import {
  createConfiguredNearRpc,
  createNearRpcRegistry,
  type NearRpc,
  type NearRpcResponse,
  type Network,
} from '@onsocial/rpc';

import { ACTIVE_API_URL, ACTIVE_NEAR_NETWORK } from '@/lib/app-config';
import {
  reportNearRpcBffFallback,
  reportNearRpcBffFailure,
  reportNearRpcBffSuccess,
} from '@/server/near-rpc-bff-alerts';

/**
 * Methods the OnSocial API-key RPC accepts. Tx status stays on the direct
 * node because the gateway does not expose it.
 */
const ONSOCIAL_RPC_METHODS = new Set([
  'query',
  'block',
  'tx',
  'broadcast_tx_async',
  'broadcast_tx_commit',
  'status',
  'gas_price',
]);

function onsocialRpc(): { url: string; apiKey: string } | null {
  const apiKey = process.env.ONSOCIAL_API_KEY?.trim();
  if (!apiKey) return null;
  return {
    url: `${ACTIVE_API_URL.replace(/\/$/, '')}/v1/rpc`,
    apiKey,
  };
}

async function callOnsocialRpc(
  endpoint: { url: string; apiKey: string },
  method: string,
  params: unknown
): Promise<NearRpcResponse> {
  const response = await fetch(endpoint.url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': endpoint.apiKey,
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 'onsocial',
      method,
      params: params ?? {},
    }),
    cache: 'no-store',
  });
  let payload: NearRpcResponse;
  try {
    payload = (await response.json()) as NearRpcResponse;
  } catch {
    throw new Error(`OnSocial RPC failed (HTTP ${response.status})`);
  }
  if (!response.ok) {
    throw new Error(
      payload.error?.message ?? `OnSocial RPC failed (HTTP ${response.status})`
    );
  }
  return payload;
}

function methodNotAllowed(payload: NearRpcResponse): boolean {
  return (
    payload.error?.code === -32601 &&
    /not allowed/i.test(payload.error.message ?? '')
  );
}

/**
 * Chain reads for the app server.
 *
 * The browser only talks to `/api/near/rpc`. This client sends those calls
 * to the OnSocial API-key RPC, which uses the in-house node and then the
 * keyed providers. A method the gateway does not serve, or a gateway
 * outage, falls through to public FastNear. The feed itself does not use
 * this path; it reads the indexer.
 */
function createAppServerNearRpc(network: Network): NearRpc {
  const gateway = onsocialRpc();
  const direct = createConfiguredNearRpc({
    network,
    publicOnly: true,
    timeoutMs: 8_000,
    maxRetries: 1,
  });

  return {
    async call<T = unknown>(
      method: string,
      params: unknown
    ): Promise<NearRpcResponse<T>> {
      if (gateway && ONSOCIAL_RPC_METHODS.has(method)) {
        try {
          const payload = (await callOnsocialRpc(
            gateway,
            method,
            params
          )) as NearRpcResponse<T>;
          if (!methodNotAllowed(payload)) {
            reportNearRpcBffSuccess({ provider: gateway.url });
            return payload;
          }
        } catch (error) {
          /* Gateway unreachable. The direct node still answers. */
          reportNearRpcBffFallback({
            method,
            provider: gateway.url,
            message: error instanceof Error ? error.message : 'gateway failed',
          });
        }
      }
      try {
        const payload = await direct.call<T>(method, params);
        reportNearRpcBffSuccess({ provider: direct.getActiveUrl() });
        return payload;
      } catch (error) {
        reportNearRpcBffFailure({
          method,
          network,
          provider: direct.getActiveUrl(),
          message: error instanceof Error ? error.message : 'RPC call failed',
        });
        throw error;
      }
    },
    getActiveUrl() {
      return gateway?.url ?? direct.getActiveUrl();
    },
    resetCircuit() {
      direct.resetCircuit();
    },
  };
}

export const getServerNearRpc = createNearRpcRegistry((network: Network) =>
  createAppServerNearRpc(network)
);

export function getActiveServerNearRpc() {
  return getServerNearRpc(ACTIVE_NEAR_NETWORK);
}
