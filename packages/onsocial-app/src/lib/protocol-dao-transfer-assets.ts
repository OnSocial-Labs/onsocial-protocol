import 'server-only';

import {
  getSpendableNearBalance,
  normalizeFtBalanceYocto,
  viewAccount,
  viewNearContract,
} from '@/lib/app-near-rpc';
import { ACTIVE_NEAR_NETWORK } from '@/lib/app-config';

export interface ProtocolDaoTransferAsset {
  /** Empty string = native NEAR in Sputnik Transfer proposals. */
  tokenId: string;
  symbol: string;
  name: string;
  icon: string | null;
  decimals: number;
  balanceSmallest: string;
}

interface IndexedFtRow {
  contractId: string;
  balanceSmallest: string;
  metadata?: Partial<OnChainFtMetadata> | null;
}

interface OnChainFtMetadata {
  symbol?: string;
  name?: string;
  icon?: string | null;
  decimals?: number;
}

const ACCOUNT_ID_PATTERN = /^[a-z0-9][a-z0-9._-]{1,63}$/;
const NEAR_TOKEN_DISPLAY = {
  symbol: 'NEAR',
  name: 'NEAR',
  icon: null,
  decimals: 24,
} as const;

function nearBlocksApiBase(): string {
  return ACTIVE_NEAR_NETWORK === 'mainnet'
    ? 'https://api.nearblocks.io'
    : 'https://api-testnet.nearblocks.io';
}

function fastNearApiBase(): string {
  return ACTIVE_NEAR_NETWORK === 'mainnet'
    ? 'https://api.fastnear.com'
    : 'https://test.api.fastnear.com';
}

function parsePositiveBalance(value: string | undefined | null): bigint {
  if (!value) {
    return 0n;
  }

  try {
    const parsed = BigInt(value);
    return parsed > 0n ? parsed : 0n;
  } catch {
    return 0n;
  }
}

async function fetchNearBlocksInventory(
  accountId: string
): Promise<IndexedFtRow[]> {
  const response = await fetch(
    `${nearBlocksApiBase()}/v1/account/${encodeURIComponent(accountId)}/inventory`,
    {
      next: { revalidate: 30 },
      signal: AbortSignal.timeout(6_000),
    }
  );

  if (!response.ok) {
    throw new Error(`NearBlocks inventory failed (${response.status})`);
  }

  const body = (await response.json().catch(() => null)) as {
    inventory?: {
      fts?: Array<{
        contract?: string;
        amount?: string;
        ft_meta?: {
          name?: string;
          symbol?: string;
          decimals?: number;
          icon?: string | null;
        } | null;
      }>;
    };
  } | null;

  return (body?.inventory?.fts ?? []).flatMap((row) => {
    const contractId = row.contract?.trim().toLowerCase();
    if (!contractId) {
      return [];
    }

    return [
      {
        contractId,
        balanceSmallest: row.amount?.trim() || '0',
        metadata: row.ft_meta
          ? {
              name: row.ft_meta.name,
              symbol: row.ft_meta.symbol,
              decimals: row.ft_meta.decimals,
              icon: null,
            }
          : null,
      },
    ];
  });
}

async function fetchFastNearFtRows(accountId: string): Promise<IndexedFtRow[]> {
  const response = await fetch(
    `${fastNearApiBase()}/v1/account/${encodeURIComponent(accountId)}/ft`,
    {
      next: { revalidate: 30 },
      signal: AbortSignal.timeout(6_000),
    }
  );

  if (!response.ok) {
    throw new Error(`FastNEAR account FT lookup failed (${response.status})`);
  }

  const body = (await response.json().catch(() => null)) as {
    tokens?: Array<{
      contract_id?: string;
      balance?: string;
    }>;
  } | null;

  return (body?.tokens ?? []).flatMap((row) => {
    const contractId = row.contract_id?.trim().toLowerCase();
    if (!contractId) {
      return [];
    }

    return [
      {
        contractId,
        balanceSmallest: row.balance?.trim() || '0',
        metadata: null,
      },
    ];
  });
}

async function fetchIndexedFtRows(accountId: string): Promise<IndexedFtRow[]> {
  try {
    return await fetchNearBlocksInventory(accountId);
  } catch {
    return fetchFastNearFtRows(accountId);
  }
}

async function readOnChainFtBalance(
  contractId: string,
  accountId: string
): Promise<bigint> {
  const balance = await viewNearContract<unknown>(contractId, 'ft_balance_of', {
    account_id: accountId,
  }).catch(() => null);
  return normalizeFtBalanceYocto(balance);
}

async function readOnChainFtMetadata(
  contractId: string
): Promise<Required<Pick<OnChainFtMetadata, 'symbol' | 'name' | 'decimals'>>> {
  const metadata = await viewNearContract<OnChainFtMetadata>(
    contractId,
    'ft_metadata',
    {}
  ).catch(() => null);

  const contractSuffix = contractId.split('.')[0] || contractId;

  return {
    symbol: metadata?.symbol?.trim() || contractSuffix.toUpperCase(),
    name: metadata?.name?.trim() || contractId,
    decimals:
      typeof metadata?.decimals === 'number' && metadata.decimals >= 0
        ? metadata.decimals
        : 18,
  };
}

async function resolveIndexedFtAsset(
  row: IndexedFtRow,
  accountId: string
): Promise<ProtocolDaoTransferAsset | null> {
  const onChainBalance = await readOnChainFtBalance(row.contractId, accountId);
  if (onChainBalance <= 0n) {
    return null;
  }

  const metadata =
    row.metadata?.symbol && row.metadata?.decimals != null
      ? {
          symbol: row.metadata.symbol,
          name: row.metadata.name ?? row.contractId,
          decimals: row.metadata.decimals,
        }
      : await readOnChainFtMetadata(row.contractId).catch(() => ({
          symbol: row.contractId.split('.')[0]?.toUpperCase() || 'FT',
          name: row.contractId,
          decimals: 18,
        }));

  return {
    tokenId: row.contractId,
    symbol: metadata.symbol,
    name: metadata.name,
    icon: null,
    decimals: metadata.decimals,
    balanceSmallest: onChainBalance.toString(),
  };
}

async function loadNearTransferAsset(
  accountId: string
): Promise<ProtocolDaoTransferAsset> {
  const nearAccount = await viewAccount(accountId);
  const balanceSmallest = getSpendableNearBalance(nearAccount);

  return {
    tokenId: '',
    symbol: NEAR_TOKEN_DISPLAY.symbol,
    name: NEAR_TOKEN_DISPLAY.name,
    icon: NEAR_TOKEN_DISPLAY.icon,
    decimals: NEAR_TOKEN_DISPLAY.decimals,
    balanceSmallest,
  };
}

function sortProtocolDaoTransferAssets(
  assets: ProtocolDaoTransferAsset[]
): ProtocolDaoTransferAsset[] {
  return [...assets].sort((left, right) => {
    if (!left.tokenId) return -1;
    if (!right.tokenId) return 1;
    return left.symbol.localeCompare(right.symbol);
  });
}

export async function loadProtocolDaoTransferAssets(
  accountId: string
): Promise<ProtocolDaoTransferAsset[]> {
  const normalizedAccountId = accountId.trim().toLowerCase();
  if (!ACCOUNT_ID_PATTERN.test(normalizedAccountId)) {
    throw new Error('Invalid accountId');
  }

  const [nearAsset, indexedRows] = await Promise.all([
    loadNearTransferAsset(normalizedAccountId),
    fetchIndexedFtRows(normalizedAccountId).catch(() => [] as IndexedFtRow[]),
  ]);

  const uniqueRows = new Map<string, IndexedFtRow>();
  for (const row of indexedRows) {
    if (parsePositiveBalance(row.balanceSmallest) <= 0n) {
      continue;
    }
    uniqueRows.set(row.contractId, row);
  }

  const ftAssets = (
    await Promise.all(
      [...uniqueRows.values()].map((row) =>
        resolveIndexedFtAsset(row, normalizedAccountId)
      )
    )
  ).filter((asset): asset is ProtocolDaoTransferAsset => asset != null);

  return sortProtocolDaoTransferAssets([
    ...(parsePositiveBalance(nearAsset.balanceSmallest) > 0n
      ? [nearAsset]
      : []),
    ...ftAssets,
  ]);
}
