'use client';

import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { OsSheetAction } from './os-sheet-action.js';
import { OsSheetActions } from './os-sheet-actions.js';
import {
  osActionDrawerConfirmBodyClassName,
  osActionDrawerConfirmCancelClassName,
  osActionDrawerConfirmClassName,
} from './action-drawer.js';
import { cn } from './cn.js';

export type OsActionDrawerConfirmVariant = 'primary' | 'danger';

export interface OsActionDrawerConfirmProps {
  body: ReactNode;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
  pending?: boolean;
  pendingLabel?: string;
  cancelLabel?: string;
  variant?: OsActionDrawerConfirmVariant;
  /** When true, primary stays visible but cannot commit. */
  confirmDisabled?: boolean;
  /** Extra controls between body and primary (toggles, errors). */
  children?: ReactNode;
  className?: string;
}

/**
 * Shared two-step confirm body for ActionDrawer (block / delete / guild).
 *
 * Confirm-pattern guide — pick one, don't mix:
 * - `OsActionDrawerConfirm` — destructive actions with consequences worth an
 *   interstitial (block, delete, transfer ownership).
 * - `useDiscardConfirm` — guards unsaved edits when a dirty sheet closes.
 * - danger `ready` arming on `OsSheetAction` — inline confirm for simple
 *   destructive commits; the pill stays muted until the guard passes.
 */
export function OsActionDrawerConfirm({
  body,
  confirmLabel,
  onConfirm,
  onCancel,
  pending = false,
  pendingLabel,
  cancelLabel = 'Cancel',
  variant = 'primary',
  confirmDisabled = false,
  children,
  className,
}: OsActionDrawerConfirmProps) {
  return (
    <div className={cn(osActionDrawerConfirmClassName, className)}>
      <p className={osActionDrawerConfirmBodyClassName}>{body}</p>
      {children}
      <OsSheetActions layout="stack" tone="frosted-primary" borderless>
        <OsSheetAction
          type="button"
          variant={variant}
          ready={!confirmDisabled}
          pending={pending}
          pendingLabel={pendingLabel ?? confirmLabel}
          disabled={pending || confirmDisabled}
          onClick={onConfirm}
        >
          {confirmLabel}
        </OsSheetAction>
      </OsSheetActions>
      {!pending ? (
        <OsActionDrawerConfirmCancel onClick={onCancel}>
          {cancelLabel}
        </OsActionDrawerConfirmCancel>
      ) : null}
    </div>
  );
}

export type OsActionDrawerConfirmCancelProps =
  ButtonHTMLAttributes<HTMLButtonElement>;

export function OsActionDrawerConfirmCancel({
  className,
  type = 'button',
  ...props
}: OsActionDrawerConfirmCancelProps) {
  return (
    <button
      type={type}
      className={cn(osActionDrawerConfirmCancelClassName, className)}
      {...props}
    />
  );
}
