import { ACTIVE_NEAR_NETWORK } from '@/lib/portal-config';
import { TOKEN_CONTRACT } from '@/lib/near-rpc';

/** Rhea / Ref Finance v2 contract (mainnet). */
export const RHEA_REF_CONTRACT = 'v2.ref-finance.near';

/** Native USDC on NEAR mainnet (SOCIAL–USDC pool 6771). */
export const USDC_MAINNET_TOKEN_ID =
  '17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1';

export const SOCIAL_RHEA_POOLS = [
  {
    label: 'SOCIAL–USDC',
    poolId: 6771,
    href: 'https://app.rhea.finance/pool/6771',
  },
  {
    label: 'SOCIAL–wNEAR',
    poolId: 6783,
    href: 'https://app.rhea.finance/pool/6783',
  },
] as const;

/** Direct Rhea pools for in-portal SOCIAL swaps (avoid fragile multi-hop routes). */
export const PORTAL_SWAP_DIRECT_POOL_IDS = SOCIAL_RHEA_POOLS.map(
  (pool) => pool.poolId
);

export function portalSwapDirectPoolId(kind: PortalSwapInputKind): number {
  return kind === 'near' ? 6783 : 6771;
}

/** Matches Rhea / ref-sdk default (`DEFAULT_SLIPPAGE_TOLERANCE`). */
export const PORTAL_SWAP_SLIPPAGE_PERCENT = 0.5;

/** Live quote refresh while an amount is entered (Rhea-style). */
export const PORTAL_SWAP_QUOTE_REFRESH_MS = 10_000;

/** Poll swap balances while the panel is open (e.g. after receiving NEAR). */
export const PORTAL_SWAP_BALANCE_REFRESH_MS = 30_000;

/** In-portal Rhea swap is mainnet-only (liquidity pools live on mainnet). */
export const PORTAL_SWAP_ENABLED = ACTIVE_NEAR_NETWORK === 'mainnet';

export const PORTAL_SWAP_SOCIAL_TOKEN_ID = TOKEN_CONTRACT;

export type PortalSwapInputKind = 'near' | 'usdc';

/** UI decimal cap for NEAR swap input (on-chain supports 24). */
export const PORTAL_SWAP_NEAR_INPUT_MAX_DECIMALS = 8;

export const PORTAL_SWAP_USDC_INPUT_MAX_DECIMALS = 6;

export function portalSwapAmountMaxDecimals(
  tokenIn: PortalSwapInputKind
): number {
  return tokenIn === 'near'
    ? PORTAL_SWAP_NEAR_INPUT_MAX_DECIMALS
    : PORTAL_SWAP_USDC_INPUT_MAX_DECIMALS;
}

/** Native NEAR held back for wrap + swap gas (yocto). ~0.005 NEAR. */
export const PORTAL_SWAP_NEAR_GAS_RESERVE_YOCTO =
  5_000_000_000_000_000_000_000n;

/** Extra NEAR when first wNEAR storage deposit is required (yocto). ~0.00125 NEAR. */
export const PORTAL_SWAP_WNEAR_STORAGE_BUFFER_YOCTO =
  1_250_000_000_000_000_000_000n;
