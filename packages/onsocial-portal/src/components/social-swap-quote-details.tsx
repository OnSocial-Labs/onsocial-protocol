'use client';

import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ChevronDown, ChevronUp } from 'lucide-react';

import {
  formatPriceImpactLabel,
  formatRouteFeeLabel,
  formatSwapDetailAmount,
  priceImpactTone,
  type PortalSwapQuoteDetails,
} from '@/lib/portal-swap-quote';
import { cn } from '@/lib/utils';

const PANEL_EASE = [0.25, 0.1, 0.25, 1] as const;

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
    <div className="flex items-baseline justify-between gap-3 text-xs">
      <span className="text-muted-foreground">{label}</span>
      <span
        className={cn(
          'font-mono text-right text-foreground tabular-nums',
          valueClassName
        )}
      >
        {value}
      </span>
    </div>
  );
}

export function SocialSwapQuoteDetails({
  quote,
  estimating,
  amountIn = '',
  embedded = false,
}: {
  quote: PortalSwapQuoteDetails | null;
  estimating: boolean;
  amountIn?: string;
  embedded?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const userDismissedRef = useRef(false);
  const wasEstimatingRef = useRef(false);

  useEffect(() => {
    if (!amountIn.trim()) {
      userDismissedRef.current = false;
      setOpen(false);
    }
  }, [amountIn]);

  useEffect(() => {
    if (
      wasEstimatingRef.current &&
      !estimating &&
      quote &&
      !userDismissedRef.current
    ) {
      setOpen(true);
    }
    wasEstimatingRef.current = estimating;
  }, [estimating, quote]);

  if (!quote && !estimating) return null;

  const impactTone = quote ? priceImpactTone(quote.priceImpactPercent) : 'low';
  const impactClass =
    impactTone === 'low'
      ? 'text-[var(--portal-green)]'
      : impactTone === 'medium'
        ? 'text-[var(--portal-amber)]'
        : 'text-[var(--portal-red)]';

  return (
    <motion.div
      initial={embedded ? false : { opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, ease: PANEL_EASE }}
      className={cn(
        embedded
          ? 'px-0 py-0'
          : 'rounded-xl border border-border/40 bg-background/20 px-3 py-2.5'
      )}
    >
      <button
        type="button"
        onClick={() => {
          setOpen((value) => {
            const next = !value;
            if (!next) userDismissedRef.current = true;
            return next;
          });
        }}
        className="flex w-full items-center justify-between gap-2 text-left"
      >
        <span className="text-xs font-medium text-muted-foreground">
          Details
          {estimating ? (
            <span className="ml-1.5 text-muted-foreground/60">
              · estimating
            </span>
          ) : null}
        </span>
        {open ? (
          <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" />
        ) : (
          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
        )}
      </button>

      <AnimatePresence initial={false}>
        {open ? (
          <motion.div
            key="swap-quote-details"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.24, ease: PANEL_EASE }}
            className="overflow-hidden"
          >
            <div
              className={cn(
                'space-y-2',
                embedded
                  ? 'mt-2 border-t border-fade-section pt-2'
                  : 'mt-3 space-y-2.5 border-t border-fade-detail pt-3'
              )}
            >
              <DetailRow
                label="Price impact"
                value={
                  estimating || !quote ? '—' : formatPriceImpactLabel(quote)
                }
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
          </motion.div>
        ) : null}
      </AnimatePresence>
    </motion.div>
  );
}
