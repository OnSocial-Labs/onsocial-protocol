'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { ArrowUpRight } from 'lucide-react';
import { HoverTimestamp } from '@/features/governance/governance-card-helpers';
import { portalCollapseTransition } from '@/features/governance/governance-motion';
import { cn } from '@/lib/utils';

type StripStatusStyle = {
  label: string;
  badgeText: string;
  badgeBg: string;
};

export function GovernanceProposalStrip({
  proposalId,
  actionBadge,
  submissionTime,
  statusStyle,
  reviewExpiry,
  interactive = true,
}: {
  proposalId: number;
  actionBadge: string | null;
  submissionTime: { relative: string; absolute: string } | null;
  statusStyle: StripStatusStyle | null;
  reviewExpiry: { relative: string; absolute: string; expired: boolean } | null;
  interactive?: boolean;
}) {
  return (
    <div
      className={cn(
        '-mx-5 -mt-5 md:-mx-6 md:-mt-6 mb-3 flex items-start justify-between gap-3 rounded-t-[calc(1.5rem-1px)] px-5 md:px-6 py-2 pb-3 font-mono portal-type-body-sm sm:items-center',
        statusStyle?.badgeBg ?? 'bg-[var(--portal-blue-bg)]'
      )}
      style={{
        maskImage: 'linear-gradient(to bottom, black 70%, transparent)',
        WebkitMaskImage:
          'linear-gradient(to bottom, black 70%, transparent)',
      }}
    >
      <div className="flex min-w-0 flex-1 items-center gap-x-2 overflow-hidden">
        <span className="shrink-0 font-semibold text-foreground">
          #{proposalId}
        </span>
        {actionBadge ? (
          <>
            <span className="shrink-0 text-foreground/20" aria-hidden="true">
              ·
            </span>
            <span className="shrink-0 font-medium uppercase tracking-[0.08em] text-foreground/50">
              {actionBadge}
            </span>
          </>
        ) : null}
        {submissionTime ? (
          <>
            <span className="shrink-0 text-foreground/20" aria-hidden="true">
              ·
            </span>
            <HoverTimestamp
              relative={submissionTime.relative}
              absolute={submissionTime.absolute}
              className="shrink-0 font-normal text-muted-foreground"
            />
          </>
        ) : null}
      </div>

      {statusStyle ? (
        <div className="shrink-0 text-right">
          <span
            className={cn(
              'inline-flex items-center justify-end gap-1.5 font-semibold uppercase tracking-wide',
              statusStyle.badgeText
            )}
          >
            <AnimatePresence mode="wait" initial={false}>
              <motion.span
                key={statusStyle.label}
                initial={{ opacity: 0, y: 3 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -3 }}
                transition={portalCollapseTransition}
              >
                {statusStyle.label}
              </motion.span>
            </AnimatePresence>
            {interactive ? (
              <ArrowUpRight
                aria-hidden="true"
                className="h-3 w-3 opacity-70 transition-all duration-200 group-hover/card:-translate-y-0.5 group-hover/card:translate-x-0.5 group-hover/card:opacity-100 group-has-[a:hover]/card:translate-x-0 group-has-[a:hover]/card:translate-y-0 group-has-[a:hover]/card:opacity-70 group-has-[button:hover]/card:translate-x-0 group-has-[button:hover]/card:translate-y-0 group-has-[button:hover]/card:opacity-70"
              />
            ) : null}
          </span>
          {reviewExpiry ? (
            <div
              className={cn(
                'mt-0.5 portal-type-caption',
                reviewExpiry.expired
                  ? 'portal-amber-text'
                  : 'text-muted-foreground'
              )}
            >
              <HoverTimestamp
                relative={reviewExpiry.relative}
                absolute={reviewExpiry.absolute}
              />
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
