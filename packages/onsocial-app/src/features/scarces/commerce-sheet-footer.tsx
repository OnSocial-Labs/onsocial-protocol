'use client';

import { useLayoutEffect, useRef, type ReactNode } from 'react';
import { OsSheetAction, OsSheetActions, OsSheetFooter } from '@onsocial/ui';

export interface CommerceSheetFooterSecondary {
  label: string;
  pendingLabel?: string;
  pending?: boolean;
  disabled?: boolean;
  onClick: () => void;
}

export interface CommerceSheetFooterState {
  visible: boolean;
  primaryLabel: string;
  primaryPendingLabel: string;
  canSubmit: boolean;
  pending: boolean;
  disabled?: boolean;
  /** Submit vs button — settle / connect flows that aren't form submit. */
  primaryType?: 'submit' | 'button';
  /** Default primary; `danger` while Delist/Cancel is armed. */
  primaryVariant?: 'primary' | 'ghost' | 'danger' | 'dismiss';
  onPrimaryClick?: () => void;
  /** Clears two-press confirm when the CTA blurs. */
  onPrimaryBlur?: () => void;
  secondary?: CommerceSheetFooterSecondary | null;
  /**
   * Data still loading — shimmer the slot instead of a guessed verb
   * (Make offer → Update offer). Not wallet pending (dots).
   */
  primaryLoading?: boolean;
  secondaryLoading?: boolean;
  /** Optional control beside primary (e.g. mint qty stepper). */
  leading?: ReactNode;
  /** Equality key when `leading` identity changes (e.g. `qty:2`). */
  leadingKey?: string;
}

function CommerceActionSkeleton({ variant }: { variant: 'primary' | 'ghost' }) {
  return (
    <span
      className={`os-sheet-action os-sheet-action--${variant} commerce-sheet-action-skel`}
      aria-hidden
    >
      <span className="standing-row-shimmer commerce-sheet-action-skel-bar" />
    </span>
  );
}

interface CommerceSheetFooterProps {
  formId: string;
  keyboardOpen: boolean;
  state: CommerceSheetFooterState | null;
}

/** Compare footer payloads ignoring callback identity (avoids sync loops). */
export function commerceFooterStatesEqual(
  a: CommerceSheetFooterState | null | undefined,
  b: CommerceSheetFooterState | null | undefined
): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  if (
    a.visible !== b.visible ||
    a.primaryLabel !== b.primaryLabel ||
    a.primaryPendingLabel !== b.primaryPendingLabel ||
    a.canSubmit !== b.canSubmit ||
    a.pending !== b.pending ||
    a.disabled !== b.disabled ||
    a.primaryType !== b.primaryType ||
    a.primaryVariant !== b.primaryVariant ||
    a.leadingKey !== b.leadingKey ||
    Boolean(a.primaryLoading) !== Boolean(b.primaryLoading) ||
    Boolean(a.secondaryLoading) !== Boolean(b.secondaryLoading)
  ) {
    return false;
  }
  const as = a.secondary;
  const bs = b.secondary;
  if (as == null && bs == null) return true;
  if (as == null || bs == null) return false;
  return (
    as.label === bs.label &&
    as.pendingLabel === bs.pendingLabel &&
    Boolean(as.pending) === Boolean(bs.pending) &&
    Boolean(as.disabled) === Boolean(bs.disabled)
  );
}

/** Sync form action state into the parent GlassSheet footer. */
export function useSyncCommerceSheetFooter(
  state: CommerceSheetFooterState | null,
  onChange?: (state: CommerceSheetFooterState | null) => void
) {
  const publishedRef = useRef<CommerceSheetFooterState | null>(null);

  useLayoutEffect(() => {
    if (!onChange) return;
    if (commerceFooterStatesEqual(publishedRef.current, state)) {
      // Keep latest callbacks even when labels match.
      publishedRef.current = state;
      return;
    }
    publishedRef.current = state;
    onChange(state);
  }, [onChange, state]);

  // Clear only on unmount — nulling on every state change re-renders the
  // sheet, recreates footer callbacks, and loops (max update depth).
  useLayoutEffect(() => {
    return () => {
      publishedRef.current = null;
      onChange?.(null);
    };
  }, [onChange]);
}

/** Pinned GlassSheet footer for scarce / Support commerce primary actions. */
export function CommerceSheetFooter({
  formId,
  keyboardOpen,
  state,
}: CommerceSheetFooterProps): ReactNode {
  if (!state?.visible) return null;

  const primaryType = state.primaryType ?? 'submit';

  return (
    <OsSheetFooter keyboardOpen={keyboardOpen}>
      <div
        className={
          state.leading ? 'collection-mint-row' : 'commerce-sheet-footer-row'
        }
      >
        {state.leading ? (
          <div className="commerce-sheet-footer-leading">{state.leading}</div>
        ) : null}
        <OsSheetActions
          layout="stack"
          tone="frosted-primary"
          borderless
          className={state.leading ? 'collection-mint-actions' : undefined}
        >
          {state.primaryLoading ? (
            <CommerceActionSkeleton
              variant={state.primaryVariant === 'ghost' ? 'ghost' : 'primary'}
            />
          ) : (
            <OsSheetAction
              type={primaryType}
              form={primaryType === 'submit' ? formId : undefined}
              variant={state.primaryVariant ?? 'primary'}
              ready={state.canSubmit}
              pending={state.pending}
              pendingLabel={state.primaryPendingLabel}
              disabled={state.disabled ?? false}
              onClick={
                primaryType === 'button' ? state.onPrimaryClick : undefined
              }
              onBlur={state.onPrimaryBlur}
            >
              {state.primaryLabel}
            </OsSheetAction>
          )}
          {state.secondaryLoading ? (
            <CommerceActionSkeleton variant="ghost" />
          ) : state.secondary ? (
            <OsSheetAction
              type="button"
              variant="ghost"
              ready={!state.secondary.pending}
              pending={Boolean(state.secondary.pending)}
              pendingLabel={state.secondary.pendingLabel}
              disabled={state.secondary.disabled ?? false}
              onClick={state.secondary.onClick}
            >
              {state.secondary.label}
            </OsSheetAction>
          ) : null}
        </OsSheetActions>
      </div>
    </OsSheetFooter>
  );
}
