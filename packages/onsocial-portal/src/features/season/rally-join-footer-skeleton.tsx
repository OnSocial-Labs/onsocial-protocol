import type { ReactNode } from 'react';
import {
  SEASON_COLLECT_ACTION_ROW_CLASS,
  resolveRallyJoinFooterMinClass,
} from '@/features/season/season-page-column';
import {
  RallyJoinActionSection,
  RallyJoinContextBlock,
} from '@/features/season/rally-join-footer-status-line';
import { RallyTextSlot } from '@/features/season/rally-text-slot';
import { cn } from '@/lib/utils';

/** Join footer — Collect-aligned two-zone layout (context + action). */
export function RallyJoinFooterFrame({
  context,
  action,
  compact = false,
  className,
}: {
  context: ReactNode;
  action: ReactNode;
  /** Homepage promo — button-only footer without hero min-height reserve. */
  compact?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex w-full flex-col',
        !compact && resolveRallyJoinFooterMinClass(),
        className
      )}
    >
      {context}
      {action}
    </div>
  );
}

/** Join flow + CTA placeholder — matches loaded join footer. */
export function RallyJoinFooterSkeleton({ className }: { className?: string }) {
  return (
    <RallyJoinFooterFrame
      className={className}
      context={
        <RallyJoinContextBlock
          joinSpendSplitLoading
          contextHintLoading
          reserveLayout
        />
      }
      action={
        <RallyJoinActionSection
          action={
            <RallyTextSlot
              lineClass={cn(
                SEASON_COLLECT_ACTION_ROW_CLASS,
                'inline-flex w-full items-center justify-center'
              )}
              loading
              pulseClass="h-9 w-[8rem] rounded-full"
            />
          }
        />
      }
    />
  );
}
