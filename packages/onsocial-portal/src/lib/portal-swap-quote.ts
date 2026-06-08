/** Rhea-aligned swap quote fields returned from `/api/swap/estimate`. */
export interface PortalSwapQuoteDetails {
  amountOut: string;
  minReceived: string;
  priceImpactPercent: string;
  priceImpactInputAmount: string;
  poolFeePercent: string;
  poolFeeAmount: string;
  exchangeRate: string;
  slippagePercent: number;
  tokenInSymbol: string;
  tokenOutSymbol: string;
}

export function formatSwapDetailAmount(value: string, maxDecimals = 6): string {
  const trimmed = value.trim();
  if (!trimmed || trimmed === '0') return '0';
  const num = Number(trimmed);
  if (!Number.isFinite(num)) return trimmed;
  const fixed = num.toFixed(maxDecimals).replace(/\.?0+$/, '');
  if (!fixed || fixed === '0') {
    if (num > 0 && num < 0.01) return '< 0.01';
    return '0';
  }
  return fixed;
}

export function formatPriceImpactLabel(quote: PortalSwapQuoteDetails): string {
  const pct = Math.abs(Number(quote.priceImpactPercent));
  if (!Number.isFinite(pct) || pct === 0) return '≈ 0%';
  const pctLabel = formatSwapDetailAmount(String(pct), 2);
  const inputLoss = Number(quote.priceImpactInputAmount);
  if (!Number.isFinite(inputLoss) || inputLoss < 0.001) {
    return `≈ -${pctLabel}%`;
  }
  const lossLabel = formatSwapDetailAmount(quote.priceImpactInputAmount, 4);
  return `≈ -${pctLabel}% / -${lossLabel} ${quote.tokenInSymbol}`;
}

export function formatRouteFeeLabel(input: {
  feePercent: string;
  feeAmount: string;
  amountIn?: string;
  tokenInSymbol: string;
}): string {
  const pctLabel = formatSwapDetailAmount(input.feePercent, 2);
  let amountLabel = formatSwapDetailAmount(input.feeAmount, 6);

  if (amountLabel === '0' && Number(input.feePercent) > 0 && input.amountIn) {
    const derived = (Number(input.amountIn) * Number(input.feePercent)) / 100;
    if (Number.isFinite(derived) && derived > 0) {
      amountLabel = formatSwapDetailAmount(String(derived), 6);
    }
  }

  if (pctLabel === '0') return '0';
  if (amountLabel === '0') return `${pctLabel}%`;
  return `${pctLabel}% / ${amountLabel} ${input.tokenInSymbol}`;
}

export function humanizeSwapTransactionError(
  raw: string | null | undefined
): string {
  const message = raw?.trim();
  if (!message) {
    return 'Swap failed. Check your wallet — if wNEAR was refunded, no SOCIAL was received.';
  }

  const lower = message.toLowerCase();
  if (lower.includes('slippage error') || lower.includes('e68')) {
    return 'Price moved before the swap finished. Your input token was refunded — try again with a fresh quote.';
  }
  if (lower.includes('insufficient')) {
    return 'Insufficient balance for this swap.';
  }
  if (lower.includes('timed out waiting')) {
    return 'Swap submitted but confirmation timed out. Check the explorer link for status.';
  }
  if (
    lower.includes('failed to fetch') ||
    lower.includes('networkerror') ||
    lower.includes('load failed')
  ) {
    return 'Could not reach the swap service. Check your connection and refresh the page.';
  }
  if (lower.includes('body.tee')) {
    return 'Swap quote failed temporarily. Wait a moment and try again.';
  }

  return message;
}

export function priceImpactTone(percent: string): 'low' | 'medium' | 'high' {
  const value = Math.abs(Number(percent));
  if (!Number.isFinite(value) || value <= 1) return 'low';
  if (value <= 2) return 'medium';
  return 'high';
}
