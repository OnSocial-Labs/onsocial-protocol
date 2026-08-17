import 'server-only';

import { SOCIAL_SPEND_CONTRACT, SOCIAL_TOKEN_CONTRACT } from '@/lib/app-config';
import { normalizeFtBalanceYocto, viewNearContract } from '@/lib/app-near-rpc';
import {
  resolveProtocolDaoSocialSpendTreasuryCapabilities,
  type ProtocolDaoSocialSpendTreasuryCapabilities,
} from '@/lib/protocol-dao-social-spend-treasury-capabilities';

export type { ProtocolDaoSocialSpendTreasuryCapabilities };
export { resolveProtocolDaoSocialSpendTreasuryCapabilities };

const ACCOUNT_ID_PATTERN = /^[a-z0-9][a-z0-9._-]{1,63}$/;

interface SocialSpendContractInfo {
  owner_id?: string;
  treasury_id?: string;
  season_ids?: string[];
}

interface SeasonConfigView {
  label?: string;
  active?: boolean;
  is_live?: boolean;
  ends_at_ns?: number | string;
}

export interface ProtocolDaoSocialSpendTreasuryContext {
  contractId: string;
  /** SOCIAL held in the DAO account wallet. */
  daoSocialBalanceYocto: string;
  canFundSeasonPool: boolean;
  /** Live rally seasons only (`active && is_live`). */
  fundableSeasonIds: string[];
}

function normalizeAccountId(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const normalized = value.trim().toLowerCase();
  return ACCOUNT_ID_PATTERN.test(normalized) ? normalized : null;
}

async function loadSocialWalletBalanceYocto(
  accountId: string
): Promise<string> {
  const balance = await viewNearContract<unknown>(
    SOCIAL_TOKEN_CONTRACT,
    'ft_balance_of',
    { account_id: accountId }
  );
  return normalizeFtBalanceYocto(balance).toString();
}

async function loadLiveSeasonIds(seasonIds: string[]): Promise<string[]> {
  const liveSeasonIds = await Promise.all(
    seasonIds.map(async (seasonId) => {
      try {
        const config = await viewNearContract<SeasonConfigView>(
          SOCIAL_SPEND_CONTRACT,
          'get_season_config',
          { season_id: seasonId }
        );
        if (config?.active && config?.is_live) {
          return seasonId;
        }
        return null;
      } catch {
        return null;
      }
    })
  );

  return liveSeasonIds.filter(
    (seasonId): seasonId is string => seasonId != null
  );
}

export async function loadProtocolDaoSocialSpendTreasuryContext(
  daoAccountId: string
): Promise<ProtocolDaoSocialSpendTreasuryContext | null> {
  const normalizedDaoAccountId = daoAccountId.trim().toLowerCase();
  if (!ACCOUNT_ID_PATTERN.test(normalizedDaoAccountId)) {
    throw new Error('Invalid daoAccountId');
  }

  const info = await viewNearContract<SocialSpendContractInfo>(
    SOCIAL_SPEND_CONTRACT,
    'get_contract_info',
    {}
  );

  const ownerId = normalizeAccountId(info?.owner_id);
  const treasuryId = normalizeAccountId(info?.treasury_id);
  const { canFundSeasonPool } =
    resolveProtocolDaoSocialSpendTreasuryCapabilities(
      normalizedDaoAccountId,
      ownerId,
      treasuryId
    );

  if (!canFundSeasonPool) {
    return null;
  }

  const seasonIdsFromInfo = Array.isArray(info?.season_ids)
    ? info.season_ids
        .filter((seasonId): seasonId is string => typeof seasonId === 'string')
        .map((seasonId) => seasonId.trim())
        .filter(Boolean)
    : [];

  let allSeasonIds = seasonIdsFromInfo;
  if (allSeasonIds.length === 0) {
    try {
      const onChainSeasonIds = await viewNearContract<string[]>(
        SOCIAL_SPEND_CONTRACT,
        'get_season_ids',
        {}
      );
      allSeasonIds = Array.isArray(onChainSeasonIds)
        ? onChainSeasonIds
            .filter(
              (seasonId): seasonId is string => typeof seasonId === 'string'
            )
            .map((seasonId) => seasonId.trim())
            .filter(Boolean)
        : [];
    } catch {
      allSeasonIds = [];
    }
  }

  const [fundableSeasonIds, daoSocialBalanceYocto] = await Promise.all([
    loadLiveSeasonIds(allSeasonIds),
    loadSocialWalletBalanceYocto(normalizedDaoAccountId),
  ]);

  return {
    contractId: SOCIAL_SPEND_CONTRACT,
    daoSocialBalanceYocto,
    canFundSeasonPool,
    fundableSeasonIds,
  };
}
