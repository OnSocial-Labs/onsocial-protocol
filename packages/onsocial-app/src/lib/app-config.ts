export type AppNearNetwork = 'testnet' | 'mainnet';

export const ACTIVE_NEAR_NETWORK: AppNearNetwork =
  process.env.NEXT_PUBLIC_NEAR_NETWORK === 'mainnet' ? 'mainnet' : 'testnet';

export const ACTIVE_API_URL =
  process.env.NEXT_PUBLIC_API_URL ??
  (ACTIVE_NEAR_NETWORK === 'mainnet'
    ? 'https://api.onsocial.id'
    : 'https://testnet.onsocial.id');

export const ACTIVE_BACKEND_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL ??
  (ACTIVE_NEAR_NETWORK === 'mainnet'
    ? 'https://api.onsocial.id'
    : 'https://testnet.onsocial.id');

export const ACTIVE_NEAR_EXPLORER_URL =
  ACTIVE_NEAR_NETWORK === 'mainnet'
    ? 'https://nearblocks.io'
    : 'https://testnet.nearblocks.io';

/** Nearblocks txn URL, or null when no hash. */
export function nearExplorerTxHref(
  txHash: string | null | undefined
): string | null {
  const hash = typeof txHash === 'string' ? txHash.trim() : '';
  if (!hash) return null;
  return `${ACTIVE_NEAR_EXPLORER_URL}/txns/${hash}`;
}

export const SOCIAL_TOKEN_CONTRACT =
  ACTIVE_NEAR_NETWORK === 'mainnet'
    ? 'token.onsocial.near'
    : 'token.onsocial.testnet';

export const SOCIAL_SPEND_CONTRACT =
  ACTIVE_NEAR_NETWORK === 'mainnet'
    ? 'social-spend.onsocial.near'
    : 'social-spend.onsocial.testnet';

/** Lock-and-earn boost contract (portfolio boost sheet). */
export const BOOST_CONTRACT =
  ACTIVE_NEAR_NETWORK === 'mainnet'
    ? 'boost.onsocial.near'
    : 'boost.onsocial.testnet';

/** Outer signer for session-relayed (NEP-366) transactions. */
export const RELAYER_ACCOUNT =
  ACTIVE_NEAR_NETWORK === 'mainnet'
    ? 'relayer.onsocial.near'
    : 'relayer.onsocial.testnet';
