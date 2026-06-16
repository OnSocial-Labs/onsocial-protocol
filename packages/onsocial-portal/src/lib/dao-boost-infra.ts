import 'server-only';

import { BOOST_CONTRACT, viewContractAt } from '@/lib/near-rpc';
import { TREASURY_DAO_ACCOUNT } from '@/lib/portal-config';
import { resolveBoostInfraCapabilities } from '@/lib/dao-boost-infra-capabilities';
import type { DaoBoostInfraContext } from '@/lib/dao-boost-infra-types';

const ACCOUNT_ID_PATTERN = /^[a-z0-9][a-z0-9._-]{1,63}$/;

interface BoostStatsView {
  owner_id?: string;
  infra_pool?: string;
  infra_withdraw_authority?: string | null;
}

export type { DaoBoostInfraContext } from '@/lib/dao-boost-infra-types';

function normalizeAccountId(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const normalized = value.trim().toLowerCase();
  return ACCOUNT_ID_PATTERN.test(normalized) ? normalized : null;
}

export async function loadDaoBoostInfraContext(
  daoAccountId: string
): Promise<DaoBoostInfraContext | null> {
  const normalizedDaoAccountId = daoAccountId.trim().toLowerCase();
  if (!ACCOUNT_ID_PATTERN.test(normalizedDaoAccountId)) {
    throw new Error('Invalid daoAccountId');
  }

  const stats = await viewContractAt<BoostStatsView>(
    BOOST_CONTRACT,
    'get_stats',
    {}
  );

  const ownerId = normalizeAccountId(stats?.owner_id);
  const infraWithdrawAuthority = normalizeAccountId(
    stats?.infra_withdraw_authority
  );
  const infraPoolYocto =
    typeof stats?.infra_pool === 'string' ? stats.infra_pool : '0';
  const treasuryDaoAccountId = TREASURY_DAO_ACCOUNT.trim().toLowerCase();

  const { canWithdrawBoostInfra, canSetBoostInfraAuthority } =
    resolveBoostInfraCapabilities({
      daoAccountId: normalizedDaoAccountId,
      ownerId,
      infraWithdrawAuthority,
      treasuryDaoAccountId,
      infraPoolYocto,
    });

  if (!canWithdrawBoostInfra && !canSetBoostInfraAuthority) {
    return null;
  }

  return {
    contractId: BOOST_CONTRACT,
    infraPoolYocto,
    ownerId,
    infraWithdrawAuthority,
    treasuryDaoAccountId,
    defaultReceiverId: treasuryDaoAccountId,
    canWithdrawBoostInfra,
    canSetBoostInfraAuthority,
  };
}
