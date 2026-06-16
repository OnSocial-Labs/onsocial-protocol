const ACCOUNT_ID_PATTERN = /^[a-z0-9][a-z0-9._-]{1,63}$/;

export interface SocialSpendTreasuryCapabilities {
  /** Fund rally via SOCIAL `ft_transfer_call` from the DAO wallet (owner or treasury_id). */
  canFundSeasonPool: boolean;
}

export function resolveSocialSpendTreasuryCapabilities(
  daoAccountId: string,
  ownerId: string | null,
  treasuryId: string | null
): SocialSpendTreasuryCapabilities {
  const normalizedDaoAccountId = daoAccountId.trim().toLowerCase();
  if (!ACCOUNT_ID_PATTERN.test(normalizedDaoAccountId)) {
    return {
      canFundSeasonPool: false,
    };
  }

  const isOwner = normalizedDaoAccountId === ownerId;
  const isTreasuryId = normalizedDaoAccountId === treasuryId;

  return {
    canFundSeasonPool: isOwner || isTreasuryId,
  };
}
