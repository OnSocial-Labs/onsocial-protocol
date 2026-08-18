import {
  GOVERNANCE_DAO_ACCOUNT,
  TREASURY_DAO_ACCOUNT,
} from '@/lib/app-config';
import {
  APP_DAOS_PATH,
  PROTOCOL_DAO_ACCOUNT_PARAM,
  PROTOCOL_DAO_BOARD_PARAM,
  PROTOCOL_FAMILY_PARAM,
  PROTOCOL_PROPOSAL_PARAM,
  PROTOCOL_SEARCH_PARAM,
  PROTOCOL_STATUS_PARAM,
  daoPortfolioPath,
  parseProtocolDaoBoard,
  parseProtocolFeedStatus,
  parseProtocolProposalId,
  parseProtocolSearchQuery,
} from '@/lib/app-routes';
import { parseProtocolProposalFamily } from '@/features/protocol/protocol-proposal-family';
import { normalizeProtocolDaoAccountId } from '@/features/protocol/dao-accounts';

export type ProtocolEntrySearch = {
  get(name: string): string | null;
};

/**
 * Map legacy `/protocol?dao=…` URLs onto DAO portfolios (or the directory).
 * Protocol launcher entry → Governance portfolio.
 */
export function resolveProtocolEntryRedirect(
  search: ProtocolEntrySearch
): string {
  const board = parseProtocolDaoBoard(search.get(PROTOCOL_DAO_BOARD_PARAM));
  const feedOpts = {
    status: parseProtocolFeedStatus(search.get(PROTOCOL_STATUS_PARAM)),
    family: parseProtocolProposalFamily(search.get(PROTOCOL_FAMILY_PARAM)),
    proposal: parseProtocolProposalId(search.get(PROTOCOL_PROPOSAL_PARAM)),
    q: parseProtocolSearchQuery(search.get(PROTOCOL_SEARCH_PARAM)),
  };

  if (board === 'treasury') {
    return daoPortfolioPath(TREASURY_DAO_ACCOUNT, feedOpts);
  }

  if (board === 'community') {
    const account = normalizeProtocolDaoAccountId(
      search.get(PROTOCOL_DAO_ACCOUNT_PARAM)
    );
    if (account) return daoPortfolioPath(account, feedOpts);
    return APP_DAOS_PATH;
  }

  return daoPortfolioPath(GOVERNANCE_DAO_ACCOUNT, feedOpts);
}
