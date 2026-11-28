const ACCOUNT_ID_PATTERN = /^[a-z0-9][a-z0-9._-]{1,63}$/;

export interface ProtocolDaoSocialSpendTreasuryCapabilities {
  /** Fund rally via SOCIAL `ft_transfer_call` from the DAO wallet. */
  canFundSeasonPool: boolean;
  /**
   * Social-spend owner — `set_season_config` (Start rally) and
   * `set_action_config` (Configure routing).
   */
  canSetSeasonConfig: boolean;
}

export function resolveProtocolDaoSocialSpendTreasuryCapabilities(
  daoAccountId: string,
  ownerId: string | null,
  treasuryId: string | null
): ProtocolDaoSocialSpendTreasuryCapabilities {
  const normalizedDaoAccountId = daoAccountId.trim().toLowerCase();
  if (!ACCOUNT_ID_PATTERN.test(normalizedDaoAccountId)) {
    return {
      canFundSeasonPool: false,
      canSetSeasonConfig: false,
    };
  }

  return {
    canFundSeasonPool:
      normalizedDaoAccountId === ownerId ||
      normalizedDaoAccountId === treasuryId,
    canSetSeasonConfig: normalizedDaoAccountId === ownerId,
  };
}
