import { viewAccount } from '@/lib/near-rpc';
import { getRequestPortalNetwork } from '@/lib/portal-network-request';
import type { PortalNearNetwork } from '@/lib/portal-network';

export interface PortalProfileNearFacts {
  accountId: string;
  network: PortalNearNetwork;
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

function nearBlocksApiBase(network: PortalNearNetwork): string {
  return network === 'mainnet'
    ? 'https://api.nearblocks.io'
    : 'https://api-testnet.nearblocks.io';
}

function explorerOrigin(network: PortalNearNetwork): string {
  return network === 'mainnet'
    ? 'https://nearblocks.io'
    : 'https://testnet.nearblocks.io';
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

async function fetchNearBlocksAccountCreation(
  accountId: string,
  network: PortalNearNetwork
): Promise<{
  blockTimestamp: number;
  transactionHash: string | null;
  explorerUrl: string | null;
} | null> {
  const response = await fetch(
    `${nearBlocksApiBase(network)}/v1/account/${encodeURIComponent(accountId)}`,
    {
      next: { revalidate: 300 },
      signal: AbortSignal.timeout(4_000),
    }
  );

  if (!response.ok) return null;

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

  if (!blockTimestamp) return null;

  const transactionHash = created?.transaction_hash?.trim() || null;

  return {
    blockTimestamp,
    transactionHash,
    explorerUrl: transactionHash
      ? `${explorerOrigin(network)}/txns/${transactionHash}`
      : null,
  };
}

export async function loadPortalProfileNearFacts(
  accountId: string
): Promise<PortalProfileNearFacts> {
  const network = await getRequestPortalNetwork();
  const [nearAccount, nearAccountCreation] = await Promise.all([
    viewAccount(accountId, network).catch(() => null),
    fetchNearBlocksAccountCreation(accountId, network).catch(() => null),
  ]);

  return {
    accountId,
    network,
    nearAccount: nearAccount
      ? {
          codeHash: nearAccount.code_hash,
          storageUsage: nearAccount.storage_usage,
        }
      : null,
    nearAccountExplorerUrl: `${explorerOrigin(network)}/address/${accountId}`,
    nearAccountCreation,
  };
}
