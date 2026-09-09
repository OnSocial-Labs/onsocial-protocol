'use client';

import type { ReactNode } from 'react';
import { cn, OsSheetAction, OsSheetActions } from '@onsocial/ui';

export const osLoadMoreClassName = 'os-load-more';

/**
 * Quiet secondary “Show more” / “Load more” control.
 * Same `OsSheetAction` primitive — `ghost` intent, `sm` placement.
 * Do not hand-roll `market-sales-more` / `guild-load-more` / feed-more pills.
 */
export function OsLoadMore({
  onClick,
  className,
  disabled,
  pending,
  children,
}: {
  onClick?: () => void;
  className?: string;
  disabled?: boolean;
  pending?: boolean;
  children: ReactNode;
}) {
  return (
    <OsSheetActions
      className={cn(osLoadMoreClassName, className)}
      layout="row-compact"
      size="sm"
      borderless
    >
      <OsSheetAction
        type="button"
        variant="ghost"
        onClick={onClick}
        disabled={disabled}
        pending={pending}
        pendingLabel="Loading…"
      >
        {children}
      </OsSheetAction>
    </OsSheetActions>
  );
}
