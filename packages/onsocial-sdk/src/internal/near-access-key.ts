import type { Network } from '../types.js';

const NEAR_RPC_URLS: Record<Network, string> = {
  mainnet: 'https://free.rpc.fastnear.com',
  testnet: 'https://test.rpc.fastnear.com',
};

/** Next delegate nonce required for `publicKey` on `accountId` (NEAR view_access_key). */
export async function fetchAccessKeyNextNonce(
  accountId: string,
  publicKey: string,
  network: Network,
  fetchImpl: typeof globalThis.fetch = globalThis.fetch.bind(globalThis)
): Promise<number> {
  const response = await fetchImpl(NEAR_RPC_URLS[network], {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    signal: AbortSignal.timeout(8_000),
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 'onsocial-sdk-access-key-nonce',
      method: 'query',
      params: {
        request_type: 'view_access_key',
        finality: 'final',
        account_id: accountId,
        public_key: publicKey,
      },
    }),
  });

  if (!response.ok) {
    throw new Error(
      `NEAR RPC access-key query failed: HTTP ${response.status}`
    );
  }

  const body = (await response.json()) as {
    error?: { message?: string };
    result?: { nonce?: number | string };
  };

  if (body.error) {
    throw new Error(body.error.message ?? 'NEAR RPC access-key query failed');
  }

  const nonce = body.result?.nonce;
  const numeric =
    typeof nonce === 'number'
      ? nonce
      : typeof nonce === 'string'
        ? Number(nonce)
        : NaN;

  if (!Number.isSafeInteger(numeric) || numeric < 0) {
    throw new Error(`NEAR RPC returned an invalid access-key nonce: ${nonce}`);
  }

  return numeric;
}
