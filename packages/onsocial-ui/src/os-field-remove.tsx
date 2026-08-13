'use client';

import type { ButtonHTMLAttributes, Ref } from 'react';
import { cn } from './cn.js';
import { MultiplyIcon } from './mage-stroke-icons.js';
import { OsSheetAction } from './os-sheet-action.js';
import { OsSheetActions } from './os-sheet-actions.js';

export const osFieldRemoveClassName = 'os-field-remove';
export const osFieldRemoveActionsClassName = 'os-field-remove-actions';
export const osFieldRemoveIconClassName = 'os-field-remove-icon';

export type OsFieldRemoveVariant = 'dismiss' | 'danger';

export interface OsFieldRemoveProps
  extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  /** Accessible name — required (icon-only control). */
  'aria-label': string;
  /**
   * `dismiss` — quiet frosted chip (poll / recipient rows).
   * `danger` — red destructive × (decline / remove from list).
   */
  variant?: OsFieldRemoveVariant;
  ready?: boolean;
  pending?: boolean;
  pendingLabel?: string;
  /**
   * When false, render only the action button for nesting inside an existing
   * `OsSheetActions` row (e.g. Approve + remove).
   */
  standalone?: boolean;
  ref?: Ref<HTMLButtonElement>;
}

/**
 * Compact field-row × — same control as poll option remove.
 * Prefer this over bespoke circular remove buttons.
 */
export function OsFieldRemove({
  'aria-label': ariaLabel,
  variant = 'dismiss',
  ready = true,
  pending = false,
  pendingLabel,
  standalone = true,
  disabled,
  className,
  type = 'button',
  ref,
  ...props
}: OsFieldRemoveProps) {
  const button = (
    <OsSheetAction
      ref={ref}
      type={type}
      variant={variant}
      ready={ready}
      pending={pending}
      pendingLabel={pendingLabel}
      disabled={disabled}
      aria-label={ariaLabel}
      className={cn(osFieldRemoveClassName, className)}
      {...props}
    >
      <MultiplyIcon className={osFieldRemoveIconClassName} aria-hidden />
    </OsSheetAction>
  );

  if (!standalone) return button;

  return (
    <OsSheetActions
      layout="row-compact"
      tone="frosted-primary"
      borderless
      className={osFieldRemoveActionsClassName}
    >
      {button}
    </OsSheetActions>
  );
}
