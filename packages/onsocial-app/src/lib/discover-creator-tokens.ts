import 'server-only';

import { ACTIVE_NEAR_NETWORK } from '@/lib/app-config';
import {
  isDiscoverableCreatorToken,
  isFtChildAccount,
  uniqueTokenContractIds,
} from '@/lib/app-discover-tokens';
import { viewNearContract } from '@/lib/app-near-rpc';
import { tryReadFtTokenMetadata } from '@/lib/token-metadata';
import type { UserCreatedTokenRecord } from '@/lib/user-created-tokens';

interface IndexedFtRow {
  contractId: string;
}

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

async function fetchNearBlocksInventory(
  accountId: string
): Promise<IndexedFtRow[]> {
  const response = await fetch(
    `${nearBlocksApiBase()}/v1/account/${encodeURIComponent(accountId)}/inventory`,
    {
      cache: 'no-store',
      signal: AbortSignal.timeout(6_000),
    }
  );
  if (!response.ok) {
    throw new Error(`NearBlocks inventory failed (${response.status})`);
  }
  const body = (await response.json().catch(() => null)) as {
    inventory?: { fts?: Array<{ contract?: string }> };
  } | null;
  return (body?.inventory?.fts ?? []).flatMap((row) => {
    const contractId = row.contract?.trim().toLowerCase();
    return contractId ? [{ contractId }] : [];
  });
}

async function fetchFastNearFtRows(accountId: string): Promise<IndexedFtRow[]> {
  const response = await fetch(
    `${fastNearApiBase()}/v1/account/${encodeURIComponent(accountId)}/ft`,
    {
      cache: 'no-store',
      signal: AbortSignal.timeout(6_000),
    }
  );
  if (!response.ok) {
    throw new Error(`FastNEAR account FT lookup failed (${response.status})`);
  }
  const body = (await response.json().catch(() => null)) as {
    tokens?: Array<{ contract_id?: string }>;
  } | null;
  return (body?.tokens ?? []).flatMap((row) => {
    const contractId = row.contract_id?.trim().toLowerCase();
    return contractId ? [{ contractId }] : [];
  });
}

async function fetchIndexedFtRows(accountId: string): Promise<IndexedFtRow[]> {
  try {
    return await fetchNearBlocksInventory(accountId);
  } catch {
    return fetchFastNearFtRows(accountId);
  }
}

async function fetchCreatedChildAccounts(accountId: string): Promise<string[]> {
  const children: string[] = [];
  for (const page of [1, 2]) {
    const response = await fetch(
      `${nearBlocksApiBase()}/v1/account/${encodeURIComponent(accountId)}/txns?page=${page}&per_page=25&order=desc`,
      {
        cache: 'no-store',
        signal: AbortSignal.timeout(6_000),
      }
    );
    if (!response.ok) break;
    const body = (await response.json().catch(() => null)) as {
      txns?: Array<{
        receiver_account_id?: string;
        actions?: Array<{ action?: string }>;
      }>;
    } | null;
    for (const txn of body?.txns ?? []) {
      const receiver = txn.receiver_account_id?.trim().toLowerCase() ?? '';
      if (!isFtChildAccount(receiver, accountId)) continue;
      const created = (txn.actions ?? []).some((action) => {
        const name = (action.action ?? '').toUpperCase();
        return name === 'CREATE_ACCOUNT' || name === 'CREATEACCOUNT';
      });
      if (created || isFtChildAccount(receiver, accountId)) {
        children.push(receiver);
      }
    }
  }
  return children;
}

async function readTokenOwner(contractId: string): Promise<string | null> {
  const owner = await viewNearContract<unknown>(
    contractId,
    'get_owner',
    {}
  ).catch(() => null);
  return typeof owner === 'string' && owner.trim() ? owner.trim() : null;
}

export async function discoverCreatorTokens(
  accountId: string
): Promise<UserCreatedTokenRecord[]> {
  const viewerId = accountId.trim().toLowerCase();
  const [holdings, created] = await Promise.all([
    fetchIndexedFtRows(viewerId).catch(() => [] as IndexedFtRow[]),
    fetchCreatedChildAccounts(viewerId).catch(() => [] as string[]),
  ]);
  const candidates = uniqueTokenContractIds([
    ...created,
    ...holdings.map((row) => row.contractId),
  ]);

  const rows = await Promise.all(
    candidates.map(async (contractId) => {
      const [metadata, ownerId] = await Promise.all([
        tryReadFtTokenMetadata(contractId),
        readTokenOwner(contractId),
      ]);
      if (!metadata) return null;
      if (
        !isDiscoverableCreatorToken({
          contractId,
          viewerId,
          ownerId,
        })
      ) {
        return null;
      }
      return {
        contractId,
        name: metadata.name,
        symbol: metadata.symbol,
        createdAt: Date.now(),
        renounced: ownerId == null || ownerId.toLowerCase() === 'system',
        icon: metadata.icon ?? undefined,
        decimals: metadata.decimals,
      } satisfies UserCreatedTokenRecord;
    })
  );

  return rows.filter((row): row is UserCreatedTokenRecord => row != null);
}
