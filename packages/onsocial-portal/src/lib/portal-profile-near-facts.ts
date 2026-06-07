import { viewAccount } from '@/lib/near-rpc';
import {
  ACTIVE_NEAR_EXPLORER_URL,
  ACTIVE_NEAR_NETWORK,
} from '@/lib/portal-config';

export interface PortalProfileNearFacts {
  accountId: string;
  network: typeof ACTIVE_NEAR_NETWORK;
  nearAccount: {
    codeHash: string;
    storageUsage: number;
  } | null;
  nearAccountExplorerUrl: string;
  nearAccountCreation: {
    blockTimestamp: number;
    transactionHash: string | null;
    explorerUrl: string | null;
  } | null;
}

function nearBlocksApiBase(): string {
  return ACTIVE_NEAR_NETWORK === 'mainnet'
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

async function fetchNearBlocksAccountCreation(accountId: string): Promise<{
  blockTimestamp: number;
  transactionHash: string | null;
  explorerUrl: string | null;
} | null> {
  const response = await fetch(
    `${nearBlocksApiBase()}/v1/account/${encodeURIComponent(accountId)}`,
    {
      next: { revalidate: 300 },
      signal: AbortSignal.timeout(4_000),
    }
  );

  if (!response.ok) return null;

  const body = (await response
    .json()
    .catch(() => null)) as {
    account?: Array<{
      created?: {
        block_timestamp?: string | number | null;
        transaction_hash?: string | null;
      } | null;
    }>;
  } | null;
  const created = body?.account?.[0]?.created;
  const blockTimestamp = normalizeNearBlocksTimestamp(created?.block_timestamp);

  if (!blockTimestamp) return null;

  const transactionHash = created?.transaction_hash?.trim() || null;

  return {
    blockTimestamp,
    transactionHash,
    explorerUrl: transactionHash
      ? `${ACTIVE_NEAR_EXPLORER_URL}/txns/${transactionHash}`
      : null,
  };
}

export async function loadPortalProfileNearFacts(
  accountId: string
): Promise<PortalProfileNearFacts> {
  const [nearAccount, nearAccountCreation] = await Promise.all([
    viewAccount(accountId).catch(() => null),
    fetchNearBlocksAccountCreation(accountId).catch(() => null),
  ]);

  return {
    accountId,
    network: ACTIVE_NEAR_NETWORK,
    nearAccount: nearAccount
      ? {
          codeHash: nearAccount.code_hash,
          storageUsage: nearAccount.storage_usage,
        }
      : null,
    nearAccountExplorerUrl: `${ACTIVE_NEAR_EXPLORER_URL}/address/${accountId}`,
    nearAccountCreation,
  };
}
