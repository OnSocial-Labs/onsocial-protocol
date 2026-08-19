import { ACTIVE_NEAR_NETWORK, SOCIAL_TOKEN_CONTRACT } from '@/lib/app-config';
import { viewNearContract } from '@/lib/app-near-rpc';

export interface FtTokenMetadata {
  symbol: string;
  name: string;
  icon: string | null;
  decimals: number;
}

/** wNEAR resolves to the native NEAR mark. */
export const WRAP_NEAR_TOKEN_ID = 'wrap.near';

export const NEAR_TOKEN_ICON = '/near.svg';

export const NEAR_TOKEN_DISPLAY: FtTokenMetadata = {
  symbol: 'NEAR',
  name: 'NEAR',
  icon: NEAR_TOKEN_ICON,
  decimals: 24,
};

function isBrokenNearIconUrl(icon: string): boolean {
  return (
    icon.includes('coingecko.com/coins/images/10353') ||
    icon.includes('assets.coingecko.com/coins/images/10353')
  );
}

/** Resolve a browser-safe FT icon from NEP-141 metadata (and wNEAR). */
export function resolveFtTokenIcon(
  tokenId: string,
  metadataIcon?: string | null
): string | null {
  const id = tokenId.trim().toLowerCase();
  if (id === WRAP_NEAR_TOKEN_ID) {
    return NEAR_TOKEN_ICON;
  }
  if (metadataIcon && isBrokenNearIconUrl(metadataIcon)) {
    return NEAR_TOKEN_ICON;
  }
  return metadataIcon?.trim() || null;
}

interface NearBlocksFungibleTokenView {
  contracts?: Array<{
    icon?: string | null;
    coingecko_id?: string | null;
  }>;
}

interface CoinGeckoTokenView {
  image?: {
    small?: string | null;
    thumb?: string | null;
    large?: string | null;
  };
}

const tokenIconFallbackCache = new Map<string, Promise<string | null>>();

function nearBlocksFtApiBase(): string {
  return ACTIVE_NEAR_NETWORK === 'mainnet'
    ? 'https://api.nearblocks.io'
    : 'https://api-testnet.nearblocks.io';
}

/** Nearblocks / CoinGecko when `ft_metadata.icon` is missing. */
export async function fetchFallbackTokenIcon(
  tokenId: string
): Promise<string | null> {
  const id = tokenId.trim().toLowerCase();
  if (id === WRAP_NEAR_TOKEN_ID) {
    return NEAR_TOKEN_ICON;
  }

  if (id === SOCIAL_TOKEN_CONTRACT.trim().toLowerCase()) {
    return '/onsocial_icon.svg';
  }

  if (!tokenIconFallbackCache.has(id)) {
    tokenIconFallbackCache.set(
      id,
      (async () => {
        const nearBlocksResponse = await fetch(
          `${nearBlocksFtApiBase()}/v1/fts/${encodeURIComponent(id)}`,
          { signal: AbortSignal.timeout(5_000) }
        ).catch(() => null);

        if (nearBlocksResponse?.ok) {
          const nearBlocksData =
            (await nearBlocksResponse.json()) as NearBlocksFungibleTokenView;
          const contract = nearBlocksData.contracts?.[0];
          if (contract?.icon) {
            return resolveFtTokenIcon(id, contract.icon);
          }

          if (
            ACTIVE_NEAR_NETWORK === 'mainnet' &&
            contract?.coingecko_id
          ) {
            const coinGeckoResponse = await fetch(
              `https://api.coingecko.com/api/v3/coins/${contract.coingecko_id}?localization=false&tickers=false&market_data=false&community_data=false&developer_data=false&sparkline=false`,
              { signal: AbortSignal.timeout(5_000) }
            ).catch(() => null);

            if (coinGeckoResponse?.ok) {
              const coinGeckoData =
                (await coinGeckoResponse.json()) as CoinGeckoTokenView;
              const icon =
                coinGeckoData.image?.small ??
                coinGeckoData.image?.thumb ??
                coinGeckoData.image?.large ??
                null;
              return resolveFtTokenIcon(id, icon);
            }
          }
        }

        return null;
      })()
    );
  }

  return tokenIconFallbackCache.get(id) ?? null;
}

interface OnChainFtMetadata {
  symbol?: string;
  name?: string;
  icon?: string | null;
  decimals?: number;
}

/** On-chain `ft_metadata` with icon fallback for indexed treasury rows. */
export async function readFtTokenMetadata(
  contractId: string
): Promise<FtTokenMetadata> {
  const id = contractId.trim().toLowerCase();
  const metadata = await viewNearContract<OnChainFtMetadata>(id, 'ft_metadata', {})
    .catch(() => null);

  let icon = resolveFtTokenIcon(id, metadata?.icon ?? null);
  if (!icon) {
    icon = await fetchFallbackTokenIcon(id);
  }

  const contractSuffix = id.split('.')[0] || id;

  return {
    symbol: metadata?.symbol?.trim() || contractSuffix.toUpperCase(),
    name: metadata?.name?.trim() || id,
    icon,
    decimals:
      typeof metadata?.decimals === 'number' && metadata.decimals >= 0
        ? metadata.decimals
        : 18,
  };
}
