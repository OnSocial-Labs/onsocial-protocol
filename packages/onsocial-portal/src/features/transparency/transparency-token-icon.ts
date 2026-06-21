import { TRANSPARENCY_NETWORK } from '@/features/transparency/transparency-constants';

interface NearBlocksFungibleTokenView {
  contracts?: Array<{
    coingecko_id?: string | null;
    icon?: string | null;
  }>;
}

interface CoinGeckoTokenView {
  image?: {
    large?: string;
    small?: string;
    thumb?: string;
  };
}

const tokenIconFallbackCache = new Map<string, Promise<string | null>>();

export async function fetchFallbackTokenIcon(
  tokenId: string
): Promise<string | null> {
  if (TRANSPARENCY_NETWORK !== 'mainnet') {
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
