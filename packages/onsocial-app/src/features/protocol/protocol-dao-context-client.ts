import type { ProtocolDaoBoostInfraContext } from '@/lib/protocol-dao-boost-infra';
import type { ProtocolDaoManagedContract } from '@/lib/protocol-dao-managed-contracts';
import type { ProtocolDaoSocialSpendTreasuryContext } from '@/lib/protocol-dao-social-spend-treasury';
import type { ProtocolDaoTransferAsset } from '@/lib/protocol-dao-transfer-assets';

const ACCOUNT_ID_PATTERN = /^[a-z0-9][a-z0-9._-]{1,63}$/;

function assertDaoAccountId(daoAccountId: string): string {
  const id = daoAccountId.trim().toLowerCase();
  if (!ACCOUNT_ID_PATTERN.test(id)) {
    throw new Error('Invalid DAO account id.');
  }
  return id;
}

async function readJson<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(detail || `Request failed (${response.status})`);
  }
  return (await response.json()) as T;
}

function daoQuery(daoAccountId: string): string {
  return new URLSearchParams({
    daoAccountId: assertDaoAccountId(daoAccountId),
  }).toString();
}

export async function fetchProtocolDaoTransferAssets(
  daoAccountId: string
): Promise<ProtocolDaoTransferAsset[]> {
  const body = await readJson<{
    assets?: ProtocolDaoTransferAsset[];
    error?: string;
  }>(
    await fetch(`/api/governance/dao/assets?${daoQuery(daoAccountId)}`, {
      cache: 'no-store',
    })
  );
  return Array.isArray(body.assets) ? body.assets : [];
}

export async function fetchProtocolDaoSocialSpendTreasury(
  daoAccountId: string
): Promise<ProtocolDaoSocialSpendTreasuryContext | null> {
  const body = await readJson<{
    context?: ProtocolDaoSocialSpendTreasuryContext | null;
    error?: string;
  }>(
    await fetch(
      `/api/governance/dao/social-spend-treasury?${daoQuery(daoAccountId)}`,
      {
        cache: 'no-store',
      }
    )
  );
  return body.context ?? null;
}

export async function fetchProtocolDaoBoostInfra(
  daoAccountId: string
): Promise<ProtocolDaoBoostInfraContext | null> {
  const body = await readJson<{
    context?: ProtocolDaoBoostInfraContext | null;
    error?: string;
  }>(
    await fetch(`/api/governance/dao/boost-infra?${daoQuery(daoAccountId)}`, {
      cache: 'no-store',
    })
  );
  return body.context ?? null;
}

export async function fetchProtocolDaoManagedContracts(
  daoAccountId: string
): Promise<ProtocolDaoManagedContract[]> {
  const body = await readJson<{
    contracts?: ProtocolDaoManagedContract[];
    error?: string;
  }>(
    await fetch(
      `/api/governance/dao/managed-contracts?${daoQuery(daoAccountId)}`,
      {
        cache: 'no-store',
      }
    )
  );
  return Array.isArray(body.contracts) ? body.contracts : [];
}
