/**
 * Supported tokens for NFT marketplace purchases via NEAR Intents
 * 
 * Users can pay with any of these tokens and solvers will automatically
 * swap to NEAR before calling the marketplace contract.
 * 
 * To add more tokens, visit: https://app.ref.finance/
 * Any token with sufficient liquidity on Ref Finance can be added.
 */

/**
 * Token configuration interface
 */
export interface Token {
  /** Token symbol (e.g., "NEAR", "USDC") */
  symbol: string;
  /** Full token name */
  name: string;
  /** Asset ID for 1Click API (e.g., "near", "nep141:social.tkn.near") */
  assetId: string;
  /** Contract ID for NEP-141 tokens (optional) */
  contractId?: string;
  /** Number of decimals */
  decimals: number;
  /** Display icon (emoji or image URL) */
  icon: string;
  /** Is this the default token? */
  isDefault?: boolean;
}

/**
 * Export TokenConfig as alias for Token (compatibility)
 */
export type TokenConfig = Token;

/**
 * Supported tokens for NFT purchases
 * 
 * Priority order:
 * 1. NEAR (native, most liquid)
 * 2. SOCIAL (community token)
 * 3. Stablecoins (USDC, USDT, DAI)
 * 4. Major tokens (wBTC, wETH, etc.)
 */
export const SUPPORTED_TOKENS: Token[] = [
  {
    symbol: 'NEAR',
    name: 'NEAR Protocol',
    assetId: 'near',
    decimals: 24,
    icon: '🔷',
    isDefault: true,
  },
  {
    symbol: 'SOCIAL',
    name: 'OnSocial Token',
    assetId: 'nep141:social.tkn.near',
    contractId: 'social.tkn.near',
    decimals: 18,
    icon: '🌐',
  },
  {
    symbol: 'USDC',
    name: 'USD Coin',
    assetId: 'nep141:17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1',
    contractId: '17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1',
    decimals: 6,
    icon: '💵',
  },
  {
    symbol: 'USDT',
    name: 'Tether USD',
    assetId: 'nep141:usdt.tether-token.near',
    contractId: 'usdt.tether-token.near',
    decimals: 6,
    icon: '💵',
  },
  {
    symbol: 'DAI',
    name: 'Dai Stablecoin',
    assetId: 'nep141:6b175474e89094c44da98b954eedeac495271d0f.factory.bridge.near',
    contractId: '6b175474e89094c44da98b954eedeac495271d0f.factory.bridge.near',
    decimals: 18,
    icon: '💵',
  },
  {
    symbol: 'wBTC',
    name: 'Wrapped Bitcoin',
    assetId: 'nep141:2260fac5e5542a773aa44fbcfedf7c193bc2c599.factory.bridge.near',
    contractId: '2260fac5e5542a773aa44fbcfedf7c193bc2c599.factory.bridge.near',
    decimals: 8,
    icon: '₿',
  },
  {
    symbol: 'wETH',
    name: 'Wrapped Ethereum',
    assetId: 'nep141:c02aaa39b223fe8d0a0e5c4f27ead9083c756cc2.factory.bridge.near',
    contractId: 'c02aaa39b223fe8d0a0e5c4f27ead9083c756cc2.factory.bridge.near',
    decimals: 18,
    icon: '⟠',
  },
  {
    symbol: 'REF',
    name: 'Ref Finance Token',
    assetId: 'nep141:token.v2.ref-finance.near',
    contractId: 'token.v2.ref-finance.near',
    decimals: 18,
    icon: '🌊',
  },
  {
    symbol: 'Aurora',
    name: 'Aurora Token',
    assetId: 'nep141:aaaaaa20d9e0e2461697782ef11675f668207961.factory.bridge.near',
    contractId: 'aaaaaa20d9e0e2461697782ef11675f668207961.factory.bridge.near',
    decimals: 18,
    icon: '🌈',
  },
];

/**
 * Get default payment token (NEAR)
 */
export function getDefaultToken(): Token {
  return SUPPORTED_TOKENS.find((t) => t.isDefault) || SUPPORTED_TOKENS[0];
}

/**
 * Get token by symbol
 */
export function getTokenBySymbol(symbol: string): Token | undefined {
  return SUPPORTED_TOKENS.find(
    (t) => t.symbol.toLowerCase() === symbol.toLowerCase()
  );
}

/**
 * Get token by contract ID
 */
export function getTokenByContractId(contractId: string): Token | undefined {
  return SUPPORTED_TOKENS.find((t) => t.contractId === contractId);
}

/**
 * Get token by asset ID
 */
export function getTokenByAssetId(assetId: string): Token | undefined {
  return SUPPORTED_TOKENS.find((t) => t.assetId === assetId);
}

/**
 * Format token amount for display
 * @param amount - Amount in smallest units (e.g., yoctoNEAR)
 * @param token - Token info
 * @returns Formatted amount with symbol
 */
export function formatTokenAmount(amount: string, token: Token): string {
  const divisor = Math.pow(10, token.decimals);
  const formatted = (parseFloat(amount) / divisor).toFixed(4);
  return `${formatted} ${token.symbol}`;
}

/**
 * Parse user input to smallest units
 * @param input - User input (e.g., "1.5")
 * @param token - Token info
 * @returns Amount in smallest units
 */
export function parseTokenAmount(input: string, token: Token): string {
  const multiplier = Math.pow(10, token.decimals);
  const amount = parseFloat(input) * multiplier;
  return Math.floor(amount).toString();
}
