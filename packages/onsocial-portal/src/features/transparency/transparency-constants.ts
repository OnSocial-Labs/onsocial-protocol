import {
  BOOST_CONTRACT,
  REWARDS_CONTRACT,
  SOCIAL_SPEND_CONTRACT,
  TOKEN_CONTRACT,
} from '@/lib/near-rpc';
import {
  ACTIVE_API_URL,
  ACTIVE_NEAR_EXPLORER_URL,
  ACTIVE_NEAR_NETWORK,
  NEAR_ACCOUNT_SUFFIX,
} from '@/lib/portal-config';
import type { PortalAccent } from '@/lib/portal-colors';

export const TRANSPARENCY_NETWORK = ACTIVE_NEAR_NETWORK;
export const TRANSPARENCY_API_URL = ACTIVE_API_URL;
export const TRANSPARENCY_EXPLORER_URL = ACTIVE_NEAR_EXPLORER_URL;
export const TRANSPARENCY_TOKEN_CONTRACT = TOKEN_CONTRACT;
export const TRANSPARENCY_REWARDS_CONTRACT = REWARDS_CONTRACT;
export const TRANSPARENCY_BOOST_CONTRACT = BOOST_CONTRACT;
export const TRANSPARENCY_SOCIAL_SPEND_CONTRACT = SOCIAL_SPEND_CONTRACT;
export const TRANSPARENCY_TOKEN_EXPLORER_URL = `${TRANSPARENCY_EXPLORER_URL}/token/${TOKEN_CONTRACT}`;
export const TRANSPARENCY_TOKEN_HOLDERS_URL = `${TRANSPARENCY_TOKEN_EXPLORER_URL}?tab=holders`;

/** Static ft_metadata facts shown on the token pulse (matches on-chain NEP-141 config). */
export const TRANSPARENCY_TOKEN_SPECS = [
  'NEP-141',
  '18 decimals',
  'Burnable',
] as const;

export const INITIAL_SUPPLY_TOKENS = 1_000_000_000n;
export const TOKEN_DECIMALS = 18n;
export const INITIAL_SUPPLY_YOCTO =
  INITIAL_SUPPLY_TOKENS * 10n ** TOKEN_DECIMALS;
export const SUPPLY_OVERVIEW_FRACTION_DIGITS = 2;
export const SUPPLY_OVERVIEW_SCALE =
  10n ** BigInt(SUPPLY_OVERVIEW_FRACTION_DIGITS);
export const YOCTO_PER_SOCIAL = 10n ** TOKEN_DECIMALS;
export const INITIAL_SUPPLY_OVERVIEW_UNITS =
  INITIAL_SUPPLY_TOKENS * SUPPLY_OVERVIEW_SCALE;

export const RHEA_CONTRACT = 'v2.ref-finance.near';
export const RHEA_SOCIAL_TOKEN = 'token.onsocial.near';

function allocationAccount(name: string): string {
  return `${name}.${NEAR_ACCOUNT_SUFFIX}`;
}

export const LIVE_ALLOCATION_ACCOUNTS = [
  {
    label: 'Reward Pool',
    account: allocationAccount('rewards'),
    accent: 'purple' as PortalAccent,
  },
  {
    label: 'Treasury',
    account: allocationAccount('treasury'),
    accent: 'blue' as PortalAccent,
  },
  {
    label: 'Influence Pool',
    account: allocationAccount('boost'),
    accent: 'green' as PortalAccent,
  },
  {
    label: 'Founder Vesting',
    account: allocationAccount('founder-vesting'),
    accent: 'gold' as PortalAccent,
  },
] as const;

export const MARKET_LIQUIDITY_POOLS = [
  {
    label: 'SOCIAL-USDC',
    href: 'https://app.rhea.finance/pool/6771',
    poolId: 6771,
  },
  {
    label: 'SOCIAL-wNEAR',
    href: 'https://app.rhea.finance/pool/6783',
    poolId: 6783,
  },
] as const;

export const TRANSPARENCY_ACTION_LINKS = [
  { label: 'Boost', href: '/boost', hint: 'Lock' },
  { label: 'OnSocial Rally', href: '/season', hint: 'Spend' },
  { label: 'Discover', href: '/discover', hint: 'Support' },
  { label: 'Governance', href: '/governance/manage', hint: 'Delegate' },
] as const;

export const TRANSPARENCY_PROTOCOL_CONTRACTS = [
  { label: 'Boost', contract: BOOST_CONTRACT },
  { label: 'Rewards', contract: REWARDS_CONTRACT },
  { label: 'Social spend', contract: SOCIAL_SPEND_CONTRACT },
] as const;
