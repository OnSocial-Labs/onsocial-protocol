/** Shared DAO account id helpers for governance peek / catalog batch paths. */

export const DAO_ACCOUNT_ID_PATTERN = /^[a-z0-9][a-z0-9._-]{1,63}$/;

/** Cap membership fan-in for Home proposal peeks. */
export const DAO_PROPOSAL_PEEK_DAO_LIMIT = 12;
/** Cap rows returned for Home proposal peeks. */
export const DAO_PROPOSAL_PEEK_ROW_LIMIT = 24;

export function normalizeDaoAccountIds(
  daoAccountIds: string[],
  limit: number
): string[] {
  const safeLimit =
    Number.isFinite(limit) && limit > 0 ? Math.min(Math.trunc(limit), 64) : 12;
  return Array.from(
    new Set(
      daoAccountIds
        .map((id) => id.trim().toLowerCase())
        .filter((id) => DAO_ACCOUNT_ID_PATTERN.test(id))
    )
  ).slice(0, safeLimit);
}
