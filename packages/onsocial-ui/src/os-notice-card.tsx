'use client';

import type {
  ButtonHTMLAttributes,
  HTMLAttributes,
  ReactNode,
  Ref,
} from 'react';
import { cn } from './cn.js';
import { osFloatingPanelClassName } from './floating-panel.js';
import { osSheetFloatingPanelClassName } from './os-sheet-floating-panel.js';

export const osNoticeCardClassName = 'os-notice-card';
export const osCommitActionsClassName = 'os-commit-actions';
export const osCommitCancelClassName = 'os-commit-cancel';

export type OsNoticeCardAlign = 'start' | 'center';

export interface OsNoticeCardProps
  extends Omit<HTMLAttributes<HTMLDivElement>, 'title'> {
  /** `center` for info (How SOCIAL); `start` for confirms. */
  align?: OsNoticeCardAlign;
  /** Wrap in floating glass shell. Off when already inside a panel. */
  shell?: boolean;
  title: ReactNode;
  titleId?: string;
  meta?: ReactNode;
  body?: ReactNode;
  bodyId?: string;
  /** Toggles, errors, extra fields between copy and footer. */
  children?: ReactNode;
  footer: ReactNode;
}

/**
 * Shared info / confirm card chrome — SOCIAL help, discard, guild confirms.
 * Pair with `os-notice-card.css` (+ floating-panel when `shell`).
 */
export function OsNoticeCard({
  align = 'start',
  shell = false,
  title,
  titleId,
  meta,
  body,
  bodyId,
  children,
  footer,
  className,
  ...props
}: OsNoticeCardProps) {
  return (
    <div
      className={cn(
        osNoticeCardClassName,
        align === 'center' && 'os-notice-card--center',
        shell && osFloatingPanelClassName,
        shell && osSheetFloatingPanelClassName,
        className
      )}
      {...props}
    >
      <div className="os-notice-card-copy">
        <p id={titleId} className="os-notice-card-title">
          {title}
        </p>
        {meta ? <p className="os-notice-card-meta">{meta}</p> : null}
        {body ? (
          <p id={bodyId} className="os-notice-card-body">
            {body}
          </p>
        ) : null}
      </div>
      {children}
      <div className="os-notice-card-footer">{footer}</div>
    </div>
  );
}

export interface OsCommitCancelProps
  extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Destructive text action (Discard). */
  danger?: boolean;
  ref?: Ref<HTMLButtonElement>;
}

/** Text cancel / Discard control for `.os-commit-actions` rows. */
export function OsCommitCancel({
  danger = false,
  className,
  type = 'button',
  ...props
}: OsCommitCancelProps) {
  return (
    <button
      type={type}
      className={cn(osCommitCancelClassName, danger && 'is-danger', className)}
      {...props}
    />
  );
}
