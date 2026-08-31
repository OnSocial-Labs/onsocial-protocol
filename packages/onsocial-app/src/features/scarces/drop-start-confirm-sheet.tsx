'use client';

import { useCallback, useState } from 'react';
import {
  OsChoiceSheetFooter,
  OsHugSheet,
  OsSheetAction,
  OsSheetActions,
} from '@onsocial/ui';
import { SHEET_Z } from '@/lib/sheet-z';

export type DropStartConfirmPhase =
  | 'review'
  | 'uploading'
  | 'ready'
  | 'listing';

export type DropStartSummaryRow = {
  label: string;
  value: string;
};

interface DropStartConfirmSheetProps {
  open: boolean;
  phase: DropStartConfirmPhase;
  rows: readonly DropStartSummaryRow[];
  /** Quiet note under the summary (e.g. media uploads first). */
  note?: string | null;
  uploadLabel?: string;
  onClose: () => void;
  onConfirm: () => void;
}

/**
 * Start-drop confirm → upload → ready → wallet. One sheet morphs through
 * phases so pin/list never feel like two separate product steps.
 */
export function DropStartConfirmSheet({
  open,
  phase,
  rows,
  note = null,
  uploadLabel = 'Uploading…',
  onClose,
  onConfirm,
}: DropStartConfirmSheetProps) {
  const [closing, setClosing] = useState(false);
  const [wasOpen, setWasOpen] = useState(open);
  const sheetOpen = open && !closing;
  const closeLocked = phase === 'uploading' || phase === 'listing';

  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setClosing(false);
  }

  const requestClose = useCallback(() => {
    if (closeLocked) return;
    setClosing(true);
  }, [closeLocked]);

  const handleClosed = useCallback(() => {
    setClosing(false);
    onClose();
  }, [onClose]);

  const title =
    phase === 'uploading'
      ? 'Uploading'
      : phase === 'ready'
        ? 'Ready to list'
        : phase === 'listing'
          ? 'Confirm in wallet'
          : 'Drop summary';

  /** Review needs no lede — the title is the brief. Status phases do. */
  const status =
    phase === 'uploading'
      ? uploadLabel
      : phase === 'ready'
        ? 'Media ready — confirm in your wallet to list.'
        : phase === 'listing'
          ? 'Approve in your wallet…'
          : null;

  const primaryLabel =
    phase === 'uploading'
      ? uploadLabel
      : phase === 'ready' || phase === 'listing'
        ? 'Confirm in wallet'
        : 'Start drop';

  const primaryPending = phase === 'uploading' || phase === 'listing';
  const primaryReady = phase === 'review' || phase === 'ready';
  const showRows = phase === 'review' || phase === 'ready';

  return (
    <OsHugSheet
      open={sheetOpen}
      onClose={requestClose}
      onClosed={handleClosed}
      chrome="choice"
      label={title}
      closeAriaLabel="Close"
      backdropLabel="Close"
      showClose={!closeLocked}
      zIndex={SHEET_Z.nestedConfirm}
      bodyClassName="drop-start-confirm-body"
      footer={
        <OsChoiceSheetFooter>
          <OsSheetActions layout="stack" tone="frosted-primary" borderless>
            <OsSheetAction
              type="button"
              variant="primary"
              ready={primaryReady}
              pending={primaryPending}
              pendingLabel={primaryLabel}
              disabled={primaryPending}
              onClick={onConfirm}
            >
              {primaryLabel}
            </OsSheetAction>
          </OsSheetActions>
        </OsChoiceSheetFooter>
      }
    >
      {status ? <p className="drop-start-confirm-summary">{status}</p> : null}
      {showRows ? (
        <section className="drop-start-confirm-rows" aria-label="Drop summary">
          {rows.map((row) => (
            <div key={row.label} className="drop-start-confirm-row">
              <span className="drop-start-confirm-label">{row.label}</span>
              <span className="drop-start-confirm-value">{row.value}</span>
            </div>
          ))}
        </section>
      ) : null}
      {note && showRows ? (
        <p className="drop-start-confirm-note">{note}</p>
      ) : null}
    </OsHugSheet>
  );
}
