const ACCOUNT_ID_PATTERN = /^[a-z0-9][a-z0-9._-]{1,63}$/;

export interface ProtocolDaoBoostInfraCapabilities {
  canWithdrawBoostInfra: boolean;
  canSetBoostInfraAuthority: boolean;
}

export function resolveProtocolDaoBoostInfraCapabilities({
  daoAccountId,
  ownerId,
  infraWithdrawAuthority,
  treasuryDaoAccountId,
  infraPoolYocto,
}: {
  daoAccountId: string;
  ownerId: string | null;
  infraWithdrawAuthority: string | null;
  treasuryDaoAccountId: string;
  infraPoolYocto: string;
}): ProtocolDaoBoostInfraCapabilities {
  const normalizedDaoAccountId = daoAccountId.trim().toLowerCase();
  const normalizedTreasuryDaoAccountId = treasuryDaoAccountId
    .trim()
    .toLowerCase();

  if (!ACCOUNT_ID_PATTERN.test(normalizedDaoAccountId)) {
    return {
      canWithdrawBoostInfra: false,
      canSetBoostInfraAuthority: false,
    };
  }

  const hasInfraBalance = (() => {
    try {
      return BigInt(infraPoolYocto) > 0n;
    } catch {
      return false;
    }
  })();

  const isOwner = normalizedDaoAccountId === ownerId;
  const isWithdrawAuthority = normalizedDaoAccountId === infraWithdrawAuthority;
  const authorityIsTreasury =
    infraWithdrawAuthority === normalizedTreasuryDaoAccountId;

  return {
    canWithdrawBoostInfra: isWithdrawAuthority && hasInfraBalance,
    canSetBoostInfraAuthority: isOwner && !authorityIsTreasury,
  };
}
