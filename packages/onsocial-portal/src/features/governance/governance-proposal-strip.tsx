'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { ProtocolMotionArrow } from '@/components/ui/protocol-motion-arrow';
import {
  type GovernanceProposalStatusSubtitle,
  HoverTimestamp,
} from '@/features/governance/governance-card-helpers';
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
  statusSubtitle,
  interactive = true,
}: {
  proposalId: number;
  actionBadge: string | null;
  submissionTime: { relative: string; absolute: string } | null;
  statusStyle: StripStatusStyle | null;
  statusSubtitle: GovernanceProposalStatusSubtitle | null;
  interactive?: boolean;
}) {
  return (
    <div
      className={cn(
        '-mx-5 -mt-5 md:-mx-6 md:-mt-6 mb-3 flex items-start justify-between gap-3 rounded-t-[calc(1.5rem-1px)] px-5 md:px-6 py-2 pb-3 font-mono portal-type-body-sm',
        statusStyle?.badgeBg ?? 'bg-[var(--portal-blue-bg)]'
      )}
      style={{
        maskImage: 'linear-gradient(to bottom, black 70%, transparent)',
        WebkitMaskImage: 'linear-gradient(to bottom, black 70%, transparent)',
      }}
    >
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <div className="flex min-w-0 items-center gap-x-2 overflow-hidden">
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
        </div>
        {submissionTime ? (
          <div className="portal-type-caption text-muted-foreground">
            Submitted{' '}
            <HoverTimestamp
              relative={submissionTime.relative}
              absolute={submissionTime.absolute}
            />
          </div>
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
              <ProtocolMotionArrow
                groupName="card"
                resetOnNestedInteractiveHover
                className="h-3 w-3"
              />
            ) : null}
          </span>
          {statusSubtitle ? (
            <div
              className={cn(
                'mt-0.5 portal-type-caption',
                statusSubtitle.tone === 'urgent'
                  ? 'portal-amber-text'
                  : 'text-muted-foreground'
              )}
            >
              {statusSubtitle.prefix ? <>{statusSubtitle.prefix} </> : null}
              <HoverTimestamp
                relative={statusSubtitle.relative}
                absolute={statusSubtitle.absolute}
              />
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
