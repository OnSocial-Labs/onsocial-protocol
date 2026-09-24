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

/**
 * Owner rain-day panel — pick a new entry / redeem end, then confirm.
 */
export function DropExtendEntryPanel({
  currentEndsAtMs,
  pending,
  onConfirm,
}: {
  currentEndsAtMs?: number | null;
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
        Push the time people can still be admitted. Passes already sold and
        later sales use this end, and Facts updates too.
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
