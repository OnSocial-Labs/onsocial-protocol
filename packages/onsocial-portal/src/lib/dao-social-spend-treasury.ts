import 'server-only';

import {
  getSocialWalletBalanceYocto,
  SOCIAL_SPEND_CONTRACT,
  viewContractAt,
} from '@/lib/near-rpc';
import {
  resolveSocialSpendTreasuryCapabilities,
  type SocialSpendTreasuryCapabilities,
} from '@/lib/dao-social-spend-treasury-capabilities';

export type { SocialSpendTreasuryCapabilities };
export { resolveSocialSpendTreasuryCapabilities };

const ACCOUNT_ID_PATTERN = /^[a-z0-9][a-z0-9._-]{1,63}$/;

interface SocialSpendContractInfo {
  owner_id?: string;
  treasury_id?: string;
  treasury_balance?: string;
  season_ids?: string[];
}

interface SeasonConfigView {
  label?: string;
  active?: boolean;
  is_live?: boolean;
  ends_at_ns?: number | string;
}

export interface DaoSocialSpendTreasuryContext {
  contractId: string;
  treasuryBalanceYocto: string;
  /** SOCIAL held in the DAO account wallet (after sweeps / transfers). */
  daoSocialBalanceYocto: string;
  treasuryId: string | null;
  ownerId: string | null;
  canWithdrawTreasury: boolean;
  canFundSeasonPool: boolean;
  canFundSeasonPoolFromDaoWallet: boolean;
  /** Live rally seasons only (`active && is_live`). */
  fundableSeasonIds: string[];
  allSeasonIds: string[];
}

function normalizeAccountId(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const normalized = value.trim().toLowerCase();
  return ACCOUNT_ID_PATTERN.test(normalized) ? normalized : null;
}

async function loadLiveSeasonIds(seasonIds: string[]): Promise<string[]> {
  const liveSeasonIds = await Promise.all(
    seasonIds.map(async (seasonId) => {
      try {
        const config = await viewContractAt<SeasonConfigView>(
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

export async function loadDaoSocialSpendTreasuryContext(
  daoAccountId: string
): Promise<DaoSocialSpendTreasuryContext | null> {
  const normalizedDaoAccountId = daoAccountId.trim().toLowerCase();
  if (!ACCOUNT_ID_PATTERN.test(normalizedDaoAccountId)) {
    throw new Error('Invalid daoAccountId');
  }

  const info = await viewContractAt<SocialSpendContractInfo>(
    SOCIAL_SPEND_CONTRACT,
    'get_contract_info',
    {}
  );

  const ownerId = normalizeAccountId(info?.owner_id);
  const treasuryId = normalizeAccountId(info?.treasury_id);
  const {
    canWithdrawTreasury,
    canFundSeasonPool,
    canFundSeasonPoolFromDaoWallet,
  } = resolveSocialSpendTreasuryCapabilities(
    normalizedDaoAccountId,
    ownerId,
    treasuryId
  );

  if (
    !canWithdrawTreasury &&
    !canFundSeasonPool &&
    !canFundSeasonPoolFromDaoWallet
  ) {
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
      const onChainSeasonIds = await viewContractAt<string[]>(
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

  const fundableSeasonIds =
    canFundSeasonPool || canFundSeasonPoolFromDaoWallet
      ? await loadLiveSeasonIds(allSeasonIds)
      : [];

  const treasuryBalance =
    typeof info?.treasury_balance === 'string' ? info.treasury_balance : '0';
  const hasTreasuryBalance = (() => {
    try {
      return BigInt(treasuryBalance) > 0n;
    } catch {
      return false;
    }
  })();

  const daoSocialBalanceYocto = (
    await getSocialWalletBalanceYocto(normalizedDaoAccountId)
  ).toString();

  return {
    contractId: SOCIAL_SPEND_CONTRACT,
    treasuryBalanceYocto: treasuryBalance,
    daoSocialBalanceYocto,
    treasuryId,
    ownerId,
    canWithdrawTreasury: canWithdrawTreasury && hasTreasuryBalance,
    canFundSeasonPool,
    canFundSeasonPoolFromDaoWallet,
    fundableSeasonIds,
    allSeasonIds,
  };
}
