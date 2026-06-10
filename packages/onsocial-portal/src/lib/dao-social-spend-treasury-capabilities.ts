const ACCOUNT_ID_PATTERN = /^[a-z0-9][a-z0-9._-]{1,63}$/;

export interface SocialSpendTreasuryCapabilities {
  canWithdrawTreasury: boolean;
  /** Fund rally from social-spend `treasury_balance` (contract owner only). */
  canFundSeasonPool: boolean;
  /** Fund rally via SOCIAL `ft_transfer_call` from the DAO wallet (owner or treasury_id). */
  canFundSeasonPoolFromDaoWallet: boolean;
}

export function resolveSocialSpendTreasuryCapabilities(
  daoAccountId: string,
  ownerId: string | null,
  treasuryId: string | null
): SocialSpendTreasuryCapabilities {
  const normalizedDaoAccountId = daoAccountId.trim().toLowerCase();
  if (!ACCOUNT_ID_PATTERN.test(normalizedDaoAccountId)) {
    return {
      canWithdrawTreasury: false,
      canFundSeasonPool: false,
      canFundSeasonPoolFromDaoWallet: false,
    };
  }

  const isOwner = normalizedDaoAccountId === ownerId;
  const isTreasuryId = normalizedDaoAccountId === treasuryId;

  return {
    canWithdrawTreasury: isOwner || isTreasuryId,
    canFundSeasonPool: isOwner,
    canFundSeasonPoolFromDaoWallet: isOwner || isTreasuryId,
  };
}
