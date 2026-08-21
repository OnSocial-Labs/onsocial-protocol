'use client';

import { useState } from 'react';
import { OsSheetAction, OsSheetActions } from '@onsocial/ui';
import {
  DropSaleWindowSheet,
  formatScheduleLabel,
  localDateTimeToMs,
  toDatetimeLocalValue,
} from '@/features/scarces/drop-sale-window-sheet';
import { formatPageDrawerJoinedFullLabel } from '@/lib/page-drawer-meta';

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
  const initial =
    currentEndsAtMs != null && currentEndsAtMs > nowMs
      ? toDatetimeLocalValue(new Date(currentEndsAtMs))
      : '';
  const [draft, setDraft] = useState(initial);
  const [pickerOpen, setPickerOpen] = useState(false);
  const minValue = toDatetimeLocalValue(new Date(nowMs + 60_000));

  const endsMs = draft ? localDateTimeToMs(draft) : undefined;
  const canConfirm = endsMs != null && endsMs > nowMs && !pending;

  return (
    <div className="drop-extend-entry-panel">
      <p className="drop-extend-entry-lede">
        Push when tickets can still be admitted. Sold tickets update on-chain;
        the event end on Facts updates too.
      </p>
      {currentEndsAtMs != null ? (
        <p className="drop-extend-entry-current">
          Current end · {formatPageDrawerJoinedFullLabel(currentEndsAtMs)}
        </p>
      ) : null}
      <button
        type="button"
        className={`drop-schedule-cell${draft ? ' has-value' : ''}`}
        disabled={pending}
        onClick={() => setPickerOpen(true)}
      >
        <span className="drop-schedule-cell-label">New entry end</span>
        <span className="drop-schedule-cell-value">
          {draft ? formatScheduleLabel(draft) : 'Pick a time'}
        </span>
      </button>
      <OsSheetActions layout="stack" tone="frosted-primary" borderless>
        <OsSheetAction
          type="button"
          variant="primary"
          ready={canConfirm}
          disabled={!canConfirm}
          onClick={() => {
            if (endsMs == null) return;
            onConfirm(endsMs);
          }}
        >
          {pending ? 'Extending…' : 'Postpone entry'}
        </OsSheetAction>
      </OsSheetActions>
      <DropSaleWindowSheet
        open={pickerOpen}
        field="eventEnds"
        value={draft}
        minValue={minValue}
        onClose={() => setPickerOpen(false)}
        onChange={(next) => {
          setDraft(next);
          setPickerOpen(false);
        }}
      />
    </div>
  );
}
