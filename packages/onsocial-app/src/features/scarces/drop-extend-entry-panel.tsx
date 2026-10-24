'use client';

import { useState } from 'react';
import {
  OsSheetAction,
  OsSheetActions,
  osActionDrawerConfirmBodyClassName,
  osActionDrawerConfirmClassName,
} from '@onsocial/ui';
import {
  DropSaleWindowSheet,
  localDateTimeToMs,
  toDatetimeLocalValue,
} from '@/features/scarces/drop-sale-window-sheet';
import {
  eventClockLabel,
  eventClockRange,
} from '@/features/scarces/ticket-event-facts';
import { SHEET_Z } from '@/lib/sheet-z';

const SALE_CLOSE_MINUTE_MS = 60_000;

/** Same minute the contract uses when a sale close follows a postpone. */
export function saleCloseMatchesEventEnd(
  saleClosesAtMs: number | null | undefined,
  eventEndsAtMs: number | null | undefined
): boolean {
  if (
    saleClosesAtMs == null ||
    eventEndsAtMs == null ||
    !Number.isFinite(saleClosesAtMs) ||
    !Number.isFinite(eventEndsAtMs) ||
    saleClosesAtMs <= 0 ||
    eventEndsAtMs <= 0
  ) {
    return false;
  }
  return (
    Math.floor(saleClosesAtMs / SALE_CLOSE_MINUTE_MS) ===
    Math.floor(eventEndsAtMs / SALE_CLOSE_MINUTE_MS)
  );
}

/** Later of now, the current close, and a chosen open. Datetime-local sorts. */
export function postponeCloseBound(
  currentCloseLocal: string,
  openDraft: string,
  floor: string
): string {
  return (
    [floor, currentCloseLocal, openDraft]
      .map((value) => value.trim())
      .filter(Boolean)
      .sort()
      .at(-1) ?? floor
  );
}

/** Current window, in the same clock as the drop page. */
export function postponeNowLine(
  currentStartsAtMs: number | null | undefined,
  currentEndsAtMs: number | null | undefined
): string | null {
  const start =
    currentStartsAtMs != null &&
    Number.isFinite(currentStartsAtMs) &&
    currentStartsAtMs > 0
      ? currentStartsAtMs
      : null;
  const end =
    currentEndsAtMs != null &&
    Number.isFinite(currentEndsAtMs) &&
    currentEndsAtMs > 0
      ? currentEndsAtMs
      : null;
  if (start != null && end != null) {
    const range = eventClockRange(start, end);
    return range ? `Now ${range}.` : null;
  }
  if (end != null) return `Now closes ${eventClockLabel(end)}.`;
  if (start != null) return `Now opens ${eventClockLabel(start)}.`;
  return null;
}

/** Cell clock. Empty until a draft is chosen. */
export function postponeDraftLabel(local: string): string {
  const ms = localDateTimeToMs(local);
  if (ms == null) return '';
  return eventClockLabel(ms);
}

/** Start can move only while the original start is still ahead. */
export function postponeStartOpen(
  currentStartsAtMs: number | null | undefined,
  nowMs: number
): boolean {
  return (
    currentStartsAtMs != null &&
    Number.isFinite(currentStartsAtMs) &&
    currentStartsAtMs > nowMs
  );
}

/** What the owner reads before they confirm a new entry end. */
export function postponeEntryLead(
  eventEndsAtMs: number | null | undefined,
  saleClosesAtMs: number | null | undefined
): string {
  // A missing close is still capped by the door. Tickets store the event
  // end as that close; either way buying stops at the end being set.
  if (
    saleClosesAtMs == null ||
    !Number.isFinite(saleClosesAtMs) ||
    saleClosesAtMs <= 0 ||
    saleCloseMatchesEventEnd(saleClosesAtMs, eventEndsAtMs)
  ) {
    return 'The sale stays open until this new end. Passes already sold stay valid.';
  }
  return `Passes stay valid until this end. The sale still closes ${eventClockLabel(saleClosesAtMs)}.`;
}

/**
 * Owner rain-day panel — pick a new entry / redeem end, then confirm.
 */
export function DropExtendEntryPanel({
  currentEndsAtMs,
  currentStartsAtMs = null,
  saleClosesAtMs = null,
  pending,
  onConfirm,
}: {
  currentEndsAtMs?: number | null;
  currentStartsAtMs?: number | null;
  /** Sale `end_time` in ms. Empty when the sale has no close. */
  saleClosesAtMs?: number | null;
  pending: boolean;
  onConfirm: (input: {
    newExpiresAtMs: number;
    newStartsAtMs?: number;
  }) => void;
}) {
  const [nowMs] = useState(() => Date.now());
  const floor = toDatetimeLocalValue(new Date(nowMs + 60_000));
  const currentLocal =
    currentEndsAtMs != null
      ? toDatetimeLocalValue(new Date(currentEndsAtMs))
      : '';
  const canMoveStart = postponeStartOpen(currentStartsAtMs, nowMs);
  const [draft, setDraft] = useState('');
  const [startDraft, setStartDraft] = useState('');
  const [pickerOpen, setPickerOpen] = useState(false);
  const [startPickerOpen, setStartPickerOpen] = useState(false);

  const endsMs = draft ? localDateTimeToMs(draft) : undefined;
  const startsMs = startDraft ? localDateTimeToMs(startDraft) : undefined;
  const laterThanCurrent =
    currentEndsAtMs == null || (endsMs != null && endsMs > currentEndsAtMs);
  const startOk =
    !canMoveStart ||
    startsMs == null ||
    (startsMs > nowMs && endsMs != null && startsMs < endsMs);
  const canConfirm =
    endsMs != null && endsMs > nowMs && laterThanCurrent && startOk && !pending;
  const closeMin = postponeCloseBound(currentLocal, startDraft, floor);
  const nowLine = postponeNowLine(currentStartsAtMs, currentEndsAtMs);

  return (
    <div className={osActionDrawerConfirmClassName}>
      <p className={osActionDrawerConfirmBodyClassName}>
        {postponeEntryLead(currentEndsAtMs, saleClosesAtMs)}
      </p>
      {nowLine ? (
        <p className={osActionDrawerConfirmBodyClassName}>{nowLine}</p>
      ) : null}
      {canMoveStart ? (
        <div className={`drop-schedule-cell${startDraft ? ' has-value' : ''}`}>
          <button
            type="button"
            className="drop-schedule-cell-main"
            disabled={pending}
            onClick={() => setStartPickerOpen(true)}
          >
            <span className="drop-schedule-cell-label">Doors open</span>
            <span className="drop-schedule-cell-value">
              {startDraft ? postponeDraftLabel(startDraft) : 'Keep current'}
            </span>
          </button>
        </div>
      ) : null}
      <div className={`drop-schedule-cell${draft ? ' has-value' : ''}`}>
        <button
          type="button"
          className="drop-schedule-cell-main"
          disabled={pending}
          onClick={() => setPickerOpen(true)}
        >
          <span className="drop-schedule-cell-label">Doors close</span>
          <span className="drop-schedule-cell-value">
            {draft ? postponeDraftLabel(draft) : 'Pick a time'}
          </span>
        </button>
      </div>
      <OsSheetActions layout="stack" tone="frosted-primary" borderless>
        <OsSheetAction
          type="button"
          variant="primary"
          ready={canConfirm}
          pending={pending}
          pendingLabel="Postponing…"
          disabled={!canConfirm}
          onClick={() => {
            if (endsMs == null) return;
            onConfirm({
              newExpiresAtMs: endsMs,
              ...(startsMs != null ? { newStartsAtMs: startsMs } : {}),
            });
          }}
        >
          Postpone
        </OsSheetAction>
      </OsSheetActions>
      {canMoveStart ? (
        <DropSaleWindowSheet
          open={startPickerOpen}
          field="eventStarts"
          value={startDraft}
          minValue={floor}
          maxValue={draft || undefined}
          allowClear
          title="Doors open"
          maxError="Must be before doors close."
          zIndex={SHEET_Z.nestedConfirm}
          onClose={() => setStartPickerOpen(false)}
          onChange={(next) => {
            setStartDraft(next);
            setStartPickerOpen(false);
          }}
        />
      ) : null}
      <DropSaleWindowSheet
        open={pickerOpen}
        field="eventEnds"
        value={draft}
        minValue={closeMin}
        allowClear={false}
        title="Doors close"
        minError={
          startDraft && startDraft === closeMin
            ? 'Must be later than doors open.'
            : 'Must be later than the current close.'
        }
        zIndex={SHEET_Z.nestedConfirm}
        onClose={() => setPickerOpen(false)}
        onChange={(next) => {
          setDraft(next);
          setPickerOpen(false);
        }}
      />
    </div>
  );
}
