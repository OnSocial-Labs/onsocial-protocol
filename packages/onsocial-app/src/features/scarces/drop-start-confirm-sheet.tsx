'use client';

import { useCallback, useId, useState } from 'react';
import {
  Divider,
  GlassSheet,
  OsSheetAction,
  OsSheetActions,
  SheetHeader,
} from '@onsocial/ui';
import { useScrollLock } from '@/hooks/use-scroll-lock';

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
  const titleId = useId();
  const [closing, setClosing] = useState(false);
  const [wasOpen, setWasOpen] = useState(open);
  const sheetOpen = open && !closing;

  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setClosing(false);
  }

  useScrollLock(sheetOpen);

  const requestClose = useCallback(() => {
    if (phase === 'uploading' || phase === 'listing') return;
    setClosing(true);
  }, [phase]);

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
    <GlassSheet
      open={sheetOpen}
      onClose={requestClose}
      onClosed={handleClosed}
      tone="os"
      sizing="hug"
      initialDetent="full"
      peekRatio={1}
      zIndex={62}
      ariaLabelledBy={titleId}
      backdropLabel="Close"
      panelClassName="os-choice-sheet-panel"
      bodyClassName="os-choice-sheet-body drop-start-confirm-body"
      header={
        <>
          <SheetHeader
            titleId={titleId}
            title={title}
            onClose={
              phase === 'uploading' || phase === 'listing'
                ? undefined
                : requestClose
            }
            closeAriaLabel="Close"
          />
          <Divider variant="section" className="glass-sheet-header-divider" />
        </>
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
    </GlassSheet>
  );
}
