'use client';

import { useLayoutEffect, useRef, type ReactNode } from 'react';
import {
  OsSheetAction,
  OsSheetActions,
} from '@/components/ui/os-sheet-primary-action';

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
  onPrimaryClick?: () => void;
  secondary?: CommerceSheetFooterSecondary | null;
  /** Optional control beside primary (e.g. mint qty stepper). */
  leading?: ReactNode;
  /** Equality key when `leading` identity changes (e.g. `qty:2`). */
  leadingKey?: string;
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
    a.leadingKey !== b.leadingKey
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

/** Pinned GlassSheet footer dock for scarce commerce primary actions. */
export function CommerceSheetFooter({
  formId,
  keyboardOpen,
  state,
}: CommerceSheetFooterProps): ReactNode {
  if (!state?.visible) return null;

  const primaryType = state.primaryType ?? 'submit';

  return (
    <div
      className={`profile-support-sheet-footer${
        keyboardOpen ? ' is-keyboard-open' : ''
      }`}
    >
      <div
        className={
          state.leading
            ? 'collection-mint-row'
            : 'commerce-sheet-footer-row'
        }
      >
        {state.leading ? (
          <div className="commerce-sheet-footer-leading">{state.leading}</div>
        ) : null}
        <OsSheetActions
          layout="stack"
          tone="frosted-primary"
          borderless
          className={
            state.leading ? 'collection-mint-actions' : undefined
          }
        >
          <OsSheetAction
            type={primaryType}
            form={primaryType === 'submit' ? formId : undefined}
            ready={state.canSubmit}
            pending={state.pending}
            pendingLabel={state.primaryPendingLabel}
            disabled={state.disabled ?? false}
            onClick={
              primaryType === 'button' ? state.onPrimaryClick : undefined
            }
          >
            {state.primaryLabel}
          </OsSheetAction>
          {state.secondary ? (
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
    </div>
  );
}
