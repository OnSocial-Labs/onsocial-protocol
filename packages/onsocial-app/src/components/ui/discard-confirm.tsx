'use client';

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type RefObject,
} from 'react';
import {
  OsCommitCancel,
  OsNoticeCard,
  OsSheetAction,
  OsSheetActions,
  osCommitActionsClassName,
} from '@onsocial/ui';

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
   * For `OsSlideOverScreen.onBeforeClose` / GlassSheet close guards.
   * Returns `false` when close should be blocked (pending or dirty → confirm).
   */
  requestCloseOrConfirm: () => boolean;
  /** Clear confirm after the surface finishes closing. */
  clearDiscardConfirm: () => void;
  keepEditing: () => void;
  discard: () => void;
}

/**
 * Dirty-close confirm state shared by hub manage / guild edit / profile editor.
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

export interface DiscardConfirmFooterProps {
  titleId: string;
  bodyId: string;
  onDiscard: () => void;
  onKeepEditing: () => void;
  keepEditingRef?: RefObject<HTMLButtonElement | null>;
  className?: string;
  title?: string;
  body?: string;
  discardLabel?: string;
  keepEditingLabel?: string;
}

/** Standard discard alertdialog card for sheet / slide-over footers. */
export function DiscardConfirmFooter({
  titleId,
  bodyId,
  onDiscard,
  onKeepEditing,
  keepEditingRef,
  className,
  title = 'Discard changes?',
  body = 'Edits won’t be saved.',
  discardLabel = 'Discard',
  keepEditingLabel = 'Keep editing',
}: DiscardConfirmFooterProps) {
  return (
    <OsNoticeCard
      className={className}
      align="center"
      shell
      title={title}
      titleId={titleId}
      body={body}
      bodyId={bodyId}
      footer={
        <div className={osCommitActionsClassName}>
          <OsCommitCancel danger onClick={onDiscard}>
            {discardLabel}
          </OsCommitCancel>
          <OsSheetActions
            layout="row-compact"
            tone="frosted-primary"
            borderless
          >
            <OsSheetAction
              ref={keepEditingRef}
              type="button"
              variant="primary"
              ready
              onClick={onKeepEditing}
            >
              {keepEditingLabel}
            </OsSheetAction>
          </OsSheetActions>
        </div>
      }
    />
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
