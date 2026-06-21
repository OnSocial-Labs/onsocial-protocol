import type { ReactNode } from 'react';
import { ProtocolMotionArrow } from '@/components/ui/protocol-motion-arrow';
import {
  RALLY_LINE_BOX_COLLECTED,
  RALLY_LINE_BOX_MICRO,
  SEASON_COLLECT_TX_LINK_ROW_CLASS,
} from '@/features/season/season-page-column';
import { RallyTextSlot } from '@/features/season/rally-text-slot';
import { cn } from '@/lib/utils';

/** Stable collected footer — skeleton and content share one frame. */
export function RallyCollectedFooterFrame({
  pending = false,
  statusLine,
  statusHref = null,
  reserveTxLink = true,
}: {
  pending?: boolean;
  statusLine?: ReactNode;
  statusHref?: string | null;
  /** When false, omit the tx link row unless statusHref is set. */
  reserveTxLink?: boolean;
}) {
  const showTxLinkRow = Boolean(statusHref) || (pending && reserveTxLink);

  return (
    <div className="flex w-full flex-col items-center">
      <RallyTextSlot
        lineClass={cn(RALLY_LINE_BOX_COLLECTED, 'portal-gold-text')}
        loading={pending}
        pulseClass="h-[1em] w-[5.5rem] sm:w-[6rem]"
      >
        {statusLine ?? (
          <span>Collected</span>
        )}
      </RallyTextSlot>
      {showTxLinkRow ? (
        <RallyTextSlot
          lineClass={cn(
            RALLY_LINE_BOX_MICRO,
            'mt-1 w-full justify-center text-muted-foreground/75',
            SEASON_COLLECT_TX_LINK_ROW_CLASS
          )}
          loading={pending && !statusHref}
          pulseClass="h-[1em] w-[7.25rem]"
        >
          {statusHref ? (
            <a
              href={statusHref}
              target="_blank"
              rel="noopener noreferrer"
              className="group/status inline-flex items-center gap-1 underline-offset-2 hover:underline"
            >
              View transaction
              <ProtocolMotionArrow className="h-3 w-3" />
            </a>
          ) : (
            <span>View transaction</span>
          )}
        </RallyTextSlot>
      ) : null}
    </div>
  );
}
