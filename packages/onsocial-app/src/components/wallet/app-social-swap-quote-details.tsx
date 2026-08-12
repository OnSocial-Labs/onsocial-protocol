'use client';

import {
  formatPriceImpactLabel,
  formatRouteFeeLabel,
  formatSwapDetailAmount,
  priceImpactTone,
  type AppSwapQuoteDetails,
} from '@/lib/app-swap-quote';

function DetailRow({
  label,
  value,
  valueClassName,
}: {
  label: string;
  value: string;
  valueClassName?: string;
}) {
  return (
    <div className="app-swap-detail-row">
      <span className="app-swap-detail-label">{label}</span>
      <span
        className={`app-swap-detail-value${valueClassName ? ` ${valueClassName}` : ''}`}
      >
        {value}
      </span>
    </div>
  );
}

/** Compact quote rows for Get SOCIAL — always visible while estimating/quoted. */
export function AppSocialSwapQuoteDetails({
  quote,
  estimating,
  amountIn = '',
}: {
  quote: AppSwapQuoteDetails | null;
  estimating: boolean;
  amountIn?: string;
}) {
  if (!quote && !estimating) return null;

  const impactTone = quote ? priceImpactTone(quote.priceImpactPercent) : 'low';
  const impactClass =
    impactTone === 'low'
      ? 'is-impact-low'
      : impactTone === 'medium'
        ? 'is-impact-medium'
        : 'is-impact-high';

  return (
    <div className="app-swap-quote-details">
      <div className="app-swap-quote-details-head">
        Details
        {estimating ? (
          <span className="app-swap-quote-details-estimating">
            {' '}
            · estimating
          </span>
        ) : null}
      </div>
      <div className="app-swap-quote-details-body">
        <DetailRow
          label="Price impact"
          value={estimating || !quote ? '—' : formatPriceImpactLabel(quote)}
          valueClassName={impactClass}
        />
        <DetailRow
          label="Route fee"
          value={
            estimating || !quote
              ? '—'
              : formatRouteFeeLabel({
                  feePercent: quote.poolFeePercent,
                  feeAmount: quote.poolFeeAmount,
                  amountIn,
                  tokenInSymbol: quote.tokenInSymbol,
                })
          }
        />
        <DetailRow
          label="Minimum received"
          value={
            estimating || !quote
              ? '—'
              : `${formatSwapDetailAmount(quote.minReceived, 6)} ${quote.tokenOutSymbol}`
          }
        />
        <DetailRow
          label="Slippage"
          value={
            quote
              ? `${formatSwapDetailAmount(String(quote.slippagePercent), 2)}%`
              : '—'
          }
        />
      </div>
    </div>
  );
}
