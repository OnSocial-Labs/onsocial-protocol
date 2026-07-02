'use client';

import type { ButtonHTMLAttributes, ReactNode, Ref } from 'react';
import { cn } from './cn.js';
import { CheckIcon } from './mage-stroke-icons.js';
import { PulsingDots } from './pulsing-dots.js';

export const osSheetActionClassName = 'os-sheet-action';

export type OsSheetActionVariant = 'primary' | 'ghost' | 'danger';

export interface OsSheetActionProps
  extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  children: ReactNode;
  variant?: OsSheetActionVariant;
  /** Primary only — framed surface when edits are ready to commit. */
  ready?: boolean;
  /** @deprecated Use {@link ready}. */
  dirty?: boolean;
  pending?: boolean;
  pendingLabel?: ReactNode;
  succeeded?: boolean;
  succeededLabel?: ReactNode;
  ref?: Ref<HTMLButtonElement>;
}

export function OsSheetAction({
  children,
  variant = 'primary',
  ready,
  dirty,
  pending = false,
  pendingLabel = 'Saving…',
  succeeded = false,
  succeededLabel,
  className,
  disabled,
  type = 'button',
  ref,
  ...props
}: OsSheetActionProps) {
  const isPrimary = variant === 'primary';
  const isReady = ready ?? dirty ?? false;
  const label = succeeded ? (succeededLabel ?? children) : children;
  const pendingSrLabel =
    typeof pendingLabel === 'string' ? pendingLabel : 'Saving';

  if (!isPrimary) {
    return (
      <button
        ref={ref}
        type={type}
        className={cn(
          osSheetActionClassName,
          `os-sheet-action--${variant}`,
          className
        )}
        disabled={disabled}
        {...props}
      >
        {children}
      </button>
    );
  }

  return (
    <button
      ref={ref}
      type={type}
      className={cn(
        osSheetActionClassName,
        'os-sheet-action--primary',
        succeeded && 'is-succeeded',
        pending && 'is-pending',
        isReady && !succeeded && !pending && 'is-ready',
        className
      )}
      disabled={disabled || pending}
      aria-busy={pending || undefined}
      {...props}
    >
      <span className="os-sheet-action__shell">
        <span
          className={cn('os-sheet-action__label', pending && 'is-hidden')}
          aria-hidden={pending || undefined}
        >
          {succeeded ? (
            <>
              <CheckIcon aria-hidden className="os-sheet-action__icon" />
              {label}
            </>
          ) : (
            label
          )}
        </span>
        {pending ? (
          <span className="os-sheet-action__pending" aria-hidden>
            <PulsingDots size="sm" label={pendingSrLabel} />
          </span>
        ) : null}
      </span>
    </button>
  );
}

/** @deprecated Use {@link OsSheetAction} with `variant="primary"`. */
export function OsSheetPrimaryAction(
  props: Omit<OsSheetActionProps, 'variant'>
) {
  return <OsSheetAction variant="primary" {...props} />;
}

/** @deprecated Use {@link OsSheetAction} with `variant="ghost"`. */
export function OsSheetGhostAction(
  props: Omit<
    OsSheetActionProps,
    'variant' | 'ready' | 'dirty' | 'pending' | 'succeeded'
  >
) {
  return <OsSheetAction variant="ghost" {...props} />;
}
