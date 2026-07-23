'use client';

import { useLayoutEffect, type ReactNode } from 'react';
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
}

interface CommerceSheetFooterProps {
  formId: string;
  keyboardOpen: boolean;
  state: CommerceSheetFooterState | null;
}

/** Sync form action state into the parent GlassSheet footer. */
export function useSyncCommerceSheetFooter(
  state: CommerceSheetFooterState | null,
  onChange?: (state: CommerceSheetFooterState | null) => void
) {
  useLayoutEffect(() => {
    if (!onChange) return;
    onChange(state);
    return () => {
      onChange(null);
    };
  }, [onChange, state]);
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
      <OsSheetActions layout="stack" tone="frosted-primary" borderless>
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
  );
}
