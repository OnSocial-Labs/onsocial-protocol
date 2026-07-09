import {
  ACTIVE_NEAR_EXPLORER_URL,
  ACTIVE_NEAR_NETWORK,
  nearExplorerTxHref,
  type AppNearNetwork,
} from '@/lib/app-config';

export interface AppNearAccountCreation {
  blockTimestamp: number;
  transactionHash: string | null;
  explorerUrl: string | null;
}

function nearBlocksApiBase(network: AppNearNetwork): string {
  return network === 'mainnet'
    ? 'https://api.nearblocks.io'
    : 'https://api-testnet.nearblocks.io';
}

function normalizeNearBlocksTimestamp(
  value?: string | number | null
): number | null {
  if (value == null) return null;

  try {
    const raw = BigInt(String(value));
    if (raw <= 0n) return null;
    if (raw > 1_000_000_000_000_000n) {
      return Number(raw / 1_000_000n);
    }
    if (raw < 1_000_000_000_000n) {
      return Number(raw * 1000n);
    }
    return Number(raw);
  } catch {
    return null;
  }
}

/** NearBlocks account creation — Portal-parity, on-demand only. */
export async function fetchNearAccountCreation(
  accountId: string,
  options: { signal?: AbortSignal } = {}
): Promise<AppNearAccountCreation | null> {
  const response = await fetch(
    `${nearBlocksApiBase(ACTIVE_NEAR_NETWORK)}/v1/account/${encodeURIComponent(accountId)}`,
    {
      cache: 'no-store',
      signal: options.signal ?? AbortSignal.timeout(4_000),
    }
  );

  if (!response.ok) {
    return null;
  }

  const body = (await response.json().catch(() => null)) as {
    account?: Array<{
      created?: {
        block_timestamp?: string | number | null;
        transaction_hash?: string | null;
      } | null;
    }>;
  } | null;

  const created = body?.account?.[0]?.created;
  const blockTimestamp = normalizeNearBlocksTimestamp(created?.block_timestamp);
  if (!blockTimestamp) {
    return null;
  }

  const transactionHash = created?.transaction_hash?.trim() || null;

  return {
    blockTimestamp,
    transactionHash,
    explorerUrl: nearExplorerTxHref(transactionHash),
  };
}

export function nearAccountExplorerHref(accountId: string): string {
  return `${ACTIVE_NEAR_EXPLORER_URL}/address/${accountId}`;
}

export function nearNetworkLabel(
  network: AppNearNetwork = ACTIVE_NEAR_NETWORK
): string {
  return network === 'mainnet' ? 'Mainnet' : 'Testnet';
}
