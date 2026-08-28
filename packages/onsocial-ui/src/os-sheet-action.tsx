'use client';

import type { ButtonHTMLAttributes, ReactNode, Ref } from 'react';
import { cn } from './cn.js';
import { CheckIcon, MultiplyIcon } from './mage-stroke-icons.js';
import { PulsingDots } from './pulsing-dots.js';

export const osSheetActionClassName = 'os-sheet-action';

export type OsSheetActionVariant = 'primary' | 'ghost' | 'danger' | 'dismiss';

export interface OsSheetActionStateInput {
  variant: OsSheetActionVariant;
  ready?: boolean;
  active?: boolean;
  pending: boolean;
  succeeded: boolean;
  failed: boolean;
  disabled?: boolean;
}

/**
 * Shared state machine for every variant: ghost is always armed, pill
 * variants gate on `ready`; pending/succeeded disable and win over ready.
 * `active` is the aria-pressed toggle state — orthogonal to arming.
 */
export function resolveOsSheetActionState({
  variant,
  ready,
  active,
  pending,
  succeeded,
  failed,
  disabled,
}: OsSheetActionStateInput) {
  const armsOnReady = variant !== 'ghost';
  const isReady = ready ?? false;
  return {
    isReady: armsOnReady && isReady && !succeeded && !failed && !pending,
    isActive: Boolean(active) && !succeeded && !pending,
    isSucceeded: succeeded,
    isFailed: failed && !succeeded,
    isPending: pending,
    isDisabled: Boolean(disabled) || pending || succeeded,
  };
}

export interface OsSheetActionProps
  extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  children: ReactNode;
  variant?: OsSheetActionVariant;
  /**
   * Arms the pill (framed frosted surface). Danger and dismiss stay muted
   * until armed so a destructive pill can never look clickable by default —
   * always drive this from the same guard as onClick (e.g. `ready={canPay}`).
   * Ghost ignores it — ghost is always armed.
   */
  ready?: boolean;
  /** Toggle state — sets aria-pressed and the selected wash (Join/Joined). */
  active?: boolean;
  pending?: boolean;
  pendingLabel?: ReactNode;
  succeeded?: boolean;
  succeededLabel?: ReactNode;
  failed?: boolean;
  failedLabel?: ReactNode;
  ref?: Ref<HTMLButtonElement>;
}

export function OsSheetAction({
  children,
  variant = 'primary',
  ready,
  active,
  pending = false,
  pendingLabel = 'Saving…',
  succeeded = false,
  succeededLabel,
  failed = false,
  failedLabel,
  className,
  disabled,
  type = 'button',
  ref,
  ...props
}: OsSheetActionProps) {
  const state = resolveOsSheetActionState({
    variant,
    ready,
    active,
    pending,
    succeeded,
    failed,
    disabled,
  });
  const label = succeeded
    ? (succeededLabel ?? children)
    : failed
      ? (failedLabel ?? children)
      : children;
  const pendingSrLabel =
    typeof pendingLabel === 'string' ? pendingLabel : 'Saving';

  return (
    <button
      ref={ref}
      type={type}
      className={cn(
        osSheetActionClassName,
        `os-sheet-action--${variant}`,
        state.isReady && 'is-ready',
        state.isActive && 'is-active',
        state.isSucceeded && 'is-succeeded',
        state.isFailed && 'is-failed',
        state.isPending && 'is-pending',
        className
      )}
      aria-busy={state.isPending || undefined}
      aria-pressed={typeof active === 'boolean' ? state.isActive : undefined}
      {...props}
      disabled={state.isDisabled}
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
          ) : failed ? (
            <>
              <MultiplyIcon aria-hidden className="os-sheet-action__icon" />
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
