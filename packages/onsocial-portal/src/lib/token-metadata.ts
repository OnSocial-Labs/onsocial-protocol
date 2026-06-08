import { ACTIVE_NEAR_NETWORK } from '@/lib/near-network';
import { TOKEN_CONTRACT, viewContractAt } from '@/lib/near-rpc';

export interface FtTokenMetadata {
  symbol: string;
  name: string;
  icon: string | null;
  decimals: number;
}

/** wNEAR on NEAR mainnet — pool pairs and swap input resolve to {@link NEAR_TOKEN_ICON}. */
export const WRAP_NEAR_TOKEN_ID = 'wrap.near';

/**
 * Native NEAR brand asset (served from portal public/).
 * CoinGecko hotlink URLs return 403 in browsers — do not use them for NEAR/wNEAR.
 */
export const NEAR_TOKEN_ICON = '/near.svg';

/** Legacy ft_metadata icon URLs that fail to load in the browser. */
function isBrokenNearIconUrl(icon: string): boolean {
  return (
    icon.includes('coingecko.com/coins/images/10353') ||
    icon.includes('assets.coingecko.com/coins/images/10353')
  );
}

/** Resolve a display icon for an FT contract id (handles wNEAR + broken NEAR URLs). */
export function resolveFtTokenIcon(
  tokenId: string,
  metadataIcon?: string | null
): string | null {
  if (tokenId === WRAP_NEAR_TOKEN_ID) {
    return NEAR_TOKEN_ICON;
  }
  if (metadataIcon && isBrokenNearIconUrl(metadataIcon)) {
    return NEAR_TOKEN_ICON;
  }
  return metadataIcon ?? null;
}

export const NEAR_TOKEN_DISPLAY: FtTokenMetadata = {
  symbol: 'NEAR',
  name: 'NEAR',
  icon: NEAR_TOKEN_ICON,
  decimals: 24,
};

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

interface OnChainFtMetadata {
  symbol?: string;
  name?: string;
  icon?: string | null;
  decimals?: number;
}

const tokenIconFallbackCache = new Map<string, Promise<string | null>>();

export async function fetchFallbackTokenIcon(
  tokenId: string
): Promise<string | null> {
  if (tokenId === WRAP_NEAR_TOKEN_ID) {
    return NEAR_TOKEN_ICON;
  }

  if (ACTIVE_NEAR_NETWORK !== 'mainnet') {
    return null;
  }

  if (!tokenIconFallbackCache.has(tokenId)) {
    tokenIconFallbackCache.set(
      tokenId,
      (async () => {
        const nearBlocksResponse = await fetch(
          `https://api.nearblocks.io/v1/fts/${tokenId}`,
          { signal: AbortSignal.timeout(5000) }
        ).catch(() => null);

        if (!nearBlocksResponse?.ok) {
          return null;
        }

        const nearBlocksData =
          (await nearBlocksResponse.json()) as NearBlocksFungibleTokenView;
        const contract = nearBlocksData.contracts?.[0];

        if (contract?.icon) {
          return contract.icon;
        }

        if (!contract?.coingecko_id) {
          return null;
        }

        const coinGeckoResponse = await fetch(
          `https://api.coingecko.com/api/v3/coins/${contract.coingecko_id}?localization=false&tickers=false&market_data=false&community_data=false&developer_data=false&sparkline=false`,
          { signal: AbortSignal.timeout(5000) }
        ).catch(() => null);

        if (!coinGeckoResponse?.ok) {
          return null;
        }

        const coinGeckoData =
          (await coinGeckoResponse.json()) as CoinGeckoTokenView;

        return (
          coinGeckoData.image?.small ??
          coinGeckoData.image?.thumb ??
          coinGeckoData.image?.large ??
          null
        );
      })()
    );
  }

  return tokenIconFallbackCache.get(tokenId) ?? null;
}

let socialTokenMetadataCache: Promise<FtTokenMetadata> | null = null;

/** SOCIAL ft_metadata with Nearblocks/CoinGecko icon fallback. */
export async function getSocialTokenMetadata(): Promise<FtTokenMetadata> {
  if (!socialTokenMetadataCache) {
    socialTokenMetadataCache = (async () => {
      const metadata = await viewContractAt<OnChainFtMetadata>(
        TOKEN_CONTRACT,
        'ft_metadata',
        {}
      ).catch(() => null);

      const icon =
        metadata?.icon ?? (await fetchFallbackTokenIcon(TOKEN_CONTRACT));

      return {
        symbol: metadata?.symbol ?? 'SOCIAL',
        name: metadata?.name ?? 'OnSocial',
        icon,
        decimals: metadata?.decimals ?? 18,
      };
    })();
  }

  return socialTokenMetadataCache;
}
