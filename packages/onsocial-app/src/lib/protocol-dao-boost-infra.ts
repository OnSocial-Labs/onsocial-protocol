import 'server-only';

import { BOOST_CONTRACT, TREASURY_DAO_ACCOUNT } from '@/lib/app-config';
import { viewNearContract } from '@/lib/app-near-rpc';
import { resolveProtocolDaoBoostInfraCapabilities } from '@/lib/protocol-dao-boost-infra-capabilities';

const ACCOUNT_ID_PATTERN = /^[a-z0-9][a-z0-9._-]{1,63}$/;

interface BoostStatsView {
  owner_id?: string;
  infra_pool?: string;
  infra_withdraw_authority?: string | null;
}

export interface ProtocolDaoBoostInfraContext {
  contractId: string;
  infraPoolYocto: string;
  ownerId: string | null;
  infraWithdrawAuthority: string | null;
  treasuryDaoAccountId: string;
  defaultReceiverId: string;
  canWithdrawBoostInfra: boolean;
  canSetBoostInfraAuthority: boolean;
}

function normalizeAccountId(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const normalized = value.trim().toLowerCase();
  return ACCOUNT_ID_PATTERN.test(normalized) ? normalized : null;
}

export async function loadProtocolDaoBoostInfraContext(
  daoAccountId: string
): Promise<ProtocolDaoBoostInfraContext | null> {
  const normalizedDaoAccountId = daoAccountId.trim().toLowerCase();
  if (!ACCOUNT_ID_PATTERN.test(normalizedDaoAccountId)) {
    throw new Error('Invalid daoAccountId');
  }

  const stats = await viewNearContract<BoostStatsView>(
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
    resolveProtocolDaoBoostInfraCapabilities({
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
