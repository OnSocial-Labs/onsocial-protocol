'use client';

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type RefObject,
} from 'react';
import { OsSheetAction } from './os-sheet-action.js';
import { OsSheetActions } from './os-sheet-actions.js';
import {
  osActionDrawerConfirmBodyClassName,
  osActionDrawerConfirmClassName,
} from './action-drawer.js';
import { OsSheetFooter } from './os-sheet-footer.js';
import { OsHugSheet } from './os-hug-sheet.js';

/**
 * Confirm-pattern guide — pick one, don't mix:
 * - `useDiscardConfirm` (this) — guards unsaved edits when a dirty sheet
 *   closes ("Discard changes?").
 * - `OsActionDrawerConfirm` — destructive actions with consequences worth an
 *   interstitial (block, delete, transfer ownership).
 * - danger `ready` arming on `OsSheetAction` — inline confirm for simple
 *   destructive commits; the pill stays muted until the guard passes.
 */
export interface UseDiscardConfirmOptions {
  /** Parent surface open — clears confirm when the surface closes. */
  open: boolean;
  dirty: boolean;
  /** When true, close requests are blocked (no discard prompt). */
  pending?: boolean;
  onClose: () => void;
}

export interface UseDiscardConfirmResult {
  discardConfirmOpen: boolean;
  discardTitleId: string;
  discardBodyId: string;
  keepEditingRef: RefObject<HTMLButtonElement | null>;
  /**
   * For slide-over / GlassSheet close guards.
   * Returns `false` when close should be blocked (pending or dirty → confirm).
   */
  requestCloseOrConfirm: () => boolean;
  /** Clear confirm after the surface finishes closing. */
  clearDiscardConfirm: () => void;
  keepEditing: () => void;
  discard: () => void;
}

/**
 * Dirty-close confirm state shared by manage / edit / profile editor sheets.
 */
export function useDiscardConfirm({
  open,
  dirty,
  pending = false,
  onClose,
}: UseDiscardConfirmOptions): UseDiscardConfirmResult {
  const discardTitleId = useId();
  const discardBodyId = useId();
  const [discardConfirmOpen, setDiscardConfirmOpen] = useState(false);
  const [wasOpen, setWasOpen] = useState(open);
  const keepEditingRef = useRef<HTMLButtonElement>(null);
  const dirtyRef = useRef(dirty);

  if (open !== wasOpen) {
    setWasOpen(open);
    if (!open) {
      setDiscardConfirmOpen(false);
    }
  }

  useEffect(() => {
    dirtyRef.current = dirty;
  }, [dirty]);

  const requestCloseOrConfirm = useCallback(() => {
    if (pending) return false;
    if (dirtyRef.current) {
      setDiscardConfirmOpen(true);
      return false;
    }
    return true;
  }, [pending]);

  const clearDiscardConfirm = useCallback(() => {
    setDiscardConfirmOpen(false);
  }, []);

  const keepEditing = useCallback(() => {
    setDiscardConfirmOpen(false);
    queueMicrotask(() => keepEditingRef.current?.focus());
  }, []);

  const discard = useCallback(() => {
    setDiscardConfirmOpen(false);
    onClose();
  }, [onClose]);

  return {
    discardConfirmOpen,
    discardTitleId,
    discardBodyId,
    keepEditingRef,
    requestCloseOrConfirm,
    clearDiscardConfirm,
    keepEditing,
    discard,
  };
}

/** Above edit-profile / DAO edit slide-overs (90) and other OS sheets. */
export const DISCARD_CONFIRM_Z = 96;

export interface DiscardConfirmSheetProps {
  open: boolean;
  onDiscard: () => void;
  onKeepEditing: () => void;
  title?: string;
  body?: string;
  discardLabel?: string;
  keepEditingLabel?: string;
  /** Override when stacking over a higher host. Default 96. */
  zIndex?: number;
  titleId?: string;
}

/**
 * Shared unsaved-changes confirm — hug sheet with Discard (danger pill)
 * on top and Keep editing as the ready action pill (same chrome as Save).
 */
export function DiscardConfirmSheet({
  open,
  onDiscard,
  onKeepEditing,
  title = 'Discard changes?',
  body = 'Edits won’t be saved.',
  discardLabel = 'Discard',
  keepEditingLabel = 'Keep editing',
  zIndex = DISCARD_CONFIRM_Z,
  titleId,
}: DiscardConfirmSheetProps) {
  return (
    <OsHugSheet
      open={open}
      onClose={onKeepEditing}
      chrome="choice"
      label={title}
      {...(titleId ? { titleId } : {})}
      closeAriaLabel={keepEditingLabel}
      backdropLabel={keepEditingLabel}
      zIndex={zIndex}
      footer={
        <OsSheetFooter>
          <OsSheetActions layout="stack" tone="frosted-primary" borderless>
            <OsSheetAction
              type="button"
              variant="danger"
              ready
              onClick={onDiscard}
            >
              {discardLabel}
            </OsSheetAction>
            <OsSheetAction
              type="button"
              variant="primary"
              ready
              onClick={onKeepEditing}
            >
              {keepEditingLabel}
            </OsSheetAction>
          </OsSheetActions>
        </OsSheetFooter>
      }
    >
      <div className={osActionDrawerConfirmClassName}>
        <p className={osActionDrawerConfirmBodyClassName}>{body}</p>
      </div>
    </OsHugSheet>
  );
}

/** Footer wrapper props when showing discard confirm (alertdialog). */
export function discardConfirmFooterA11y(
  open: boolean,
  titleId: string,
  bodyId: string
): {
  role?: 'alertdialog';
  'aria-modal'?: true;
  'aria-labelledby'?: string;
  'aria-describedby'?: string;
} {
  if (!open) return {};
  return {
    role: 'alertdialog',
    'aria-modal': true,
    'aria-labelledby': titleId,
    'aria-describedby': bodyId,
  };
}
