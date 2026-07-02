'use client';

import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from './cn.js';

export const osSheetActionsClassName = 'os-sheet-actions';

/** Expand a lone action to full row width (e.g. stack footers). */
export const osSheetActionExpandedClassName = 'os-sheet-action--expanded';

/** Keep row flex slots while hiding an action (save pending / success). */
export const osSheetActionInertSlotClassName = 'os-sheet-action--inert-slot';

export type OsSheetActionsLayout = 'stack' | 'row' | 'row-compact';

/**
 * Frosted glass pill material for sheet footers.
 * `frosted` is an alias of `frosted-primary` (same look as preview bar).
 */
export type OsSheetActionsTone = 'default' | 'frosted' | 'frosted-primary';

export interface OsSheetActionsProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  layout?: OsSheetActionsLayout;
  tone?: OsSheetActionsTone;
  /** Match profile editor discard confirm — frost danger pill. */
  discardConfirm?: boolean;
}

export function OsSheetActions({
  children,
  className,
  layout = 'stack',
  tone = 'default',
  discardConfirm = false,
  ...props
}: OsSheetActionsProps) {
  return (
    <div
      className={cn(
        osSheetActionsClassName,
        layout === 'stack' && 'os-sheet-actions--stack',
        layout === 'row' && 'os-sheet-actions--row',
        layout === 'row-compact' && 'os-sheet-actions--row-compact',
        (tone === 'frosted' || tone === 'frosted-primary') &&
          'os-sheet-actions--frosted-primary',
        discardConfirm && 'os-sheet-actions--discard-confirm',
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}
