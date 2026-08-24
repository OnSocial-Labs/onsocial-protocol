/**
 * Proposal family lens for DAO feeds — coarse buckets over status chips.
 * Badges (Mood / Boost / …) stay specific; family groups them for filtering.
 */

import {
  PROTOCOL_FAMILY_PARAM,
  PROTOCOL_PROPOSAL_PARAM,
  PROTOCOL_SEARCH_PARAM,
  PROTOCOL_STATUS_PARAM,
} from '@/lib/app-routes';

export type ProtocolProposalFamily =
  | 'all'
  | 'face'
  | 'boost'
  | 'support'
  | 'treasury'
  | 'membership'
  | 'config';

export const PROTOCOL_FEED_FAMILY_OPTIONS: Array<{
  id: ProtocolProposalFamily;
  label: string;
}> = [
  { id: 'all', label: 'All' },
  { id: 'face', label: 'Face' },
  { id: 'boost', label: 'Boost' },
  { id: 'support', label: 'Support' },
  { id: 'treasury', label: 'Treasury' },
  { id: 'membership', label: 'Members' },
  { id: 'config', label: 'Config' },
];

/** Map a presentation action badge to a feed family. */
export function protocolProposalFamilyFromBadge(
  badge: string | null | undefined
): ProtocolProposalFamily {
  const value = badge?.trim().toLowerCase() ?? '';
  switch (value) {
    case 'mood':
    case 'post':
    case 'profile':
      return 'face';
    case 'boost':
      return 'boost';
    case 'support':
      return 'support';
    case 'transfer':
    case 'treasury':
      return 'treasury';
    case 'join':
    case 'leave':
    case 'role':
    case 'remove role':
    case 'policy':
    case 'parameters':
    case 'vote policy':
    case 'staking':
      return 'membership';
    case 'config':
    case 'season':
    case 'upgrade':
    case 'ownership':
    case 'signal':
    case 'call':
    default:
      return 'config';
  }
}

export function parseProtocolProposalFamily(
  raw: string | null | undefined
): ProtocolProposalFamily {
  const value = raw?.trim().toLowerCase() ?? '';
  switch (value) {
    case 'face':
    case 'boost':
    case 'support':
    case 'treasury':
    case 'membership':
    case 'members':
      return value === 'members' ? 'membership' : value;
    case 'config':
      return 'config';
    case 'all':
    default:
      return 'all';
  }
}

/**
 * Portfolio query that should open the Proposals overlay.
 * Matches `daoPortfolioPath` — proposal id, status, search, or family `kind`.
 */
export function hasDaoProposalsDeepLink(searchParams: {
  get(name: string): string | null;
}): boolean {
  return Boolean(
    searchParams.get(PROTOCOL_PROPOSAL_PARAM)?.trim() ||
      searchParams.get(PROTOCOL_STATUS_PARAM)?.trim() ||
      searchParams.get(PROTOCOL_SEARCH_PARAM)?.trim() ||
      parseProtocolProposalFamily(searchParams.get(PROTOCOL_FAMILY_PARAM)) !==
        'all'
  );
}
