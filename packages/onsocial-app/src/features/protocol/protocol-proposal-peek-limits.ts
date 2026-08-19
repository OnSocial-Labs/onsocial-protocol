/** Shared with backend `governance-dao-ids` peek caps. */
export const PROTOCOL_PROPOSAL_PEEK_DAO_LIMIT = 12;
export const PROTOCOL_PROPOSAL_PEEK_LIMIT = 24;

export const PROTOCOL_DAO_ACCOUNT_ID_PATTERN = /^[a-z0-9][a-z0-9._-]{1,63}$/;

export function normalizeProtocolDaoAccountIds(
  daoAccountIds: string[],
  limit = PROTOCOL_PROPOSAL_PEEK_DAO_LIMIT
): string[] {
  return Array.from(
    new Set(
      daoAccountIds
        .map((id) => id.trim().toLowerCase())
        .filter((id) => PROTOCOL_DAO_ACCOUNT_ID_PATTERN.test(id))
    )
  ).slice(0, limit);
}
