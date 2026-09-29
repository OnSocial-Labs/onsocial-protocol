/**
 * 1Click quote builder. The scarce price is Pyth NEAR/USD. This quote only
 * funds that NEAR amount from another coin.
 */

export const WRAP_NEAR_ASSET = 'nep141:wrap.near';
export const NEAR_USD_PRICE_ID =
  'c415de8d2eba7db216527dff4b60e8f3a5311c740dadb233e13e12547e226750';

const ONE_CLICK_ORIGIN = 'https://1click.chaindefuser.com';

export function hermesHost(network: string): string {
  // Hermes requires a Pyth API key. The key stays on the gateway.
  return network === 'mainnet'
    ? 'https://hermes.pyth.network'
    : 'https://hermes-beta.pyth.network';
}

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

export function hermesUpdateUrl(network: string): string {
  const id = NEAR_USD_PRICE_ID;
  return `${hermesHost(network)}/v2/updates/price/latest?ids[]=${id}&encoding=hex&parsed=true`;
}
