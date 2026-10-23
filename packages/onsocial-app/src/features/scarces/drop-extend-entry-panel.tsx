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
  formatScheduleLabel,
  localDateTimeToMs,
  toDatetimeLocalValue,
} from '@/features/scarces/drop-sale-window-sheet';
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

/** What the owner reads before they confirm a new entry end. */
export function postponeEntryLead(
  eventEndsAtMs: number | null | undefined,
  saleClosesAtMs: number | null | undefined
): string {
  if (
    saleClosesAtMs == null ||
    !Number.isFinite(saleClosesAtMs) ||
    saleClosesAtMs <= 0
  ) {
    return 'Passes stay valid until this end. The sale stays open until sold out.';
  }
  if (saleCloseMatchesEventEnd(saleClosesAtMs, eventEndsAtMs)) {
    return 'The sale stays open until this new end. Passes already sold stay valid.';
  }
  const label = formatScheduleLabel(
    toDatetimeLocalValue(new Date(saleClosesAtMs))
  );
  return `Passes stay valid until this end. The sale still closes ${label}.`;
}

/**
 * Owner rain-day panel — pick a new entry / redeem end, then confirm.
 */
export function DropExtendEntryPanel({
  currentEndsAtMs,
  saleClosesAtMs = null,
  pending,
  onConfirm,
}: {
  currentEndsAtMs?: number | null;
  /** Sale `end_time` in ms. Empty means the sale has no close. */
  saleClosesAtMs?: number | null;
  pending: boolean;
  onConfirm: (newExpiresAtMs: number) => void;
}) {
  const [nowMs] = useState(() => Date.now());
  const floor = toDatetimeLocalValue(new Date(nowMs + 60_000));
  const currentLocal =
    currentEndsAtMs != null
      ? toDatetimeLocalValue(new Date(currentEndsAtMs))
      : '';
  const minValue = currentLocal > floor ? currentLocal : floor;
  const [draft, setDraft] = useState('');
  const [pickerOpen, setPickerOpen] = useState(false);

  const endsMs = draft ? localDateTimeToMs(draft) : undefined;
  const laterThanCurrent =
    currentEndsAtMs == null || (endsMs != null && endsMs > currentEndsAtMs);
  const canConfirm =
    endsMs != null && endsMs > nowMs && laterThanCurrent && !pending;

  return (
    <div className={osActionDrawerConfirmClassName}>
      <p className={osActionDrawerConfirmBodyClassName}>
        {postponeEntryLead(currentEndsAtMs, saleClosesAtMs)}
      </p>
      {currentEndsAtMs != null && currentLocal ? (
        <p className={osActionDrawerConfirmBodyClassName}>
          Current end · {formatScheduleLabel(currentLocal)}
        </p>
      ) : null}
      <div className={`drop-schedule-cell${draft ? ' has-value' : ''}`}>
        <button
          type="button"
          className="drop-schedule-cell-main"
          disabled={pending}
          onClick={() => setPickerOpen(true)}
        >
          <span className="drop-schedule-cell-label">New entry end</span>
          <span className="drop-schedule-cell-value">
            {draft ? formatScheduleLabel(draft) : 'Pick a time'}
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
            onConfirm(endsMs);
          }}
        >
          Postpone entry
        </OsSheetAction>
      </OsSheetActions>
      <DropSaleWindowSheet
        open={pickerOpen}
        field="eventEnds"
        value={draft}
        minValue={minValue}
        allowClear={false}
        minError="Must be later than the current end."
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
