/**
 * 1Click quote builder. The scarce price comes from the on-chain oracle; the
 * token list only gives the app an indicative NEAR/USD for the buyer stop.
 * This quote only funds that NEAR amount from another coin.
 */

export const WRAP_NEAR_ASSET = 'nep141:wrap.near';

const ONE_CLICK_ORIGIN = 'https://1click.chaindefuser.com';

export interface ExactNearQuoteInput {
  originAsset: string;
  amountOutYocto: string;
  recipient: string;
  refundTo: string;
  dry?: boolean;
  nowMs?: number;
}

export function buildExactNearQuote(input: ExactNearQuoteInput): {
  url: string;
  body: Record<string, unknown>;
} {
  if (!input.originAsset.startsWith('nep141:')) {
    throw new Error('Origin asset must be a nep141 id from the token list');
  }
  if (!/^\d+$/.test(input.amountOutYocto) || input.amountOutYocto === '0') {
    throw new Error('NEAR amount must be a positive integer');
  }
  if (!input.recipient || !input.refundTo) {
    throw new Error('Recipient and refund account are required');
  }
  const now = input.nowMs ?? Date.now();
  return {
    url: `${ONE_CLICK_ORIGIN}/v0/quote`,
    body: {
      dry: input.dry !== false,
      swapType: 'EXACT_OUTPUT',
      slippageTolerance: 100,
      originAsset: input.originAsset,
      depositType: 'ORIGIN_CHAIN',
      destinationAsset: WRAP_NEAR_ASSET,
      amount: input.amountOutYocto,
      recipient: input.recipient,
      recipientType: 'DESTINATION_CHAIN',
      refundTo: input.refundTo,
      refundType: 'ORIGIN_CHAIN',
      deadline: new Date(now + 3 * 60 * 1000).toISOString(),
    },
  };
}

export function tokensUrl(): string {
  return `${ONE_CLICK_ORIGIN}/v0/tokens`;
}

export function statusUrl(depositAddress: string): string {
  return `${ONE_CLICK_ORIGIN}/v0/status?depositAddress=${encodeURIComponent(depositAddress)}`;
}

/**
 * Indicative NEAR/USD from the 1Click token list. The contract's oracle is
 * authoritative; this only sizes the buyer's maximum NEAR.
 */
export function wrapNearUsdPrice(
  tokens: unknown
): { priceUsd: string; updatedAt: string } | null {
  if (!Array.isArray(tokens)) return null;
  for (const row of tokens) {
    if (!row || typeof row !== 'object') continue;
    const token = row as {
      assetId?: unknown;
      price?: unknown;
      priceUpdatedAt?: unknown;
    };
    if (token.assetId !== WRAP_NEAR_ASSET) continue;
    if (typeof token.price !== 'number' || !(token.price > 0)) return null;
    return {
      priceUsd: String(token.price),
      updatedAt:
        typeof token.priceUpdatedAt === 'string' ? token.priceUpdatedAt : '',
    };
  }
  return null;
}
