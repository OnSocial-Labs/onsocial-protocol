'use client';

import type { ReactNode } from 'react';
import { cn, OsSheetAction, OsSheetActions } from '@onsocial/ui';

export const osChipActionClassName = 'os-chip-action';

/**
 * Quiet additive / settings chip (+ room, Enable all, ↑↓, disclosure).
 * Same `OsSheetAction` primitive — `ghost` intent, `sm` placement.
 * Prefer this over hand-rolled `guild-secondary-button` chips.
 * Pagination “Show more” stays on `OsLoadMore`.
 */
export function OsChipAction({
  onClick,
  className,
  disabled,
  'aria-label': ariaLabel,
  children,
}: {
  onClick?: () => void;
  className?: string;
  disabled?: boolean;
  'aria-label'?: string;
  children: ReactNode;
}) {
  return (
    <OsSheetActions
      className={cn(osChipActionClassName, className)}
      layout="row-compact"
      size="sm"
      borderless
    >
      <OsSheetAction
        type="button"
        variant="ghost"
        onClick={onClick}
        disabled={disabled}
        aria-label={ariaLabel}
      >
        {children}
      </OsSheetAction>
    </OsSheetActions>
  );
}
