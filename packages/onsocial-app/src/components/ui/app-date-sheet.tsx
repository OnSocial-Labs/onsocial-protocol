'use client';

/**
 * Date-only hug calendar — same `.drop-cal` chrome as the drop schedule
 * sheet, without time drums. Value is local `YYYY-MM-DD`.
 */

import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from 'react';
import {
  ChevronDownIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  OsHugSheet,
  OsSheetAction,
  OsSheetActions,
  OsSheetFooter,
} from '@onsocial/ui';
import { SHEET_Z } from '@/lib/sheet-z';

const YEAR_WINDOW = 6;

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function todayDateString(now = new Date()): string {
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

function parseDateString(date: string): Date {
  return new Date(
    Number(date.slice(0, 4)),
    Number(date.slice(5, 7)) - 1,
    Number(date.slice(8, 10))
  );
}

function toDateString(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function addDays(date: string, days: number): string {
  const next = parseDateString(date);
  next.setDate(next.getDate() + days);
  return toDateString(next);
}

function addMonths(date: string, months: number): string {
  const base = parseDateString(date);
  const day = base.getDate();
  const target = new Date(base.getFullYear(), base.getMonth() + months, 1);
  const daysInTarget = new Date(
    target.getFullYear(),
    target.getMonth() + 1,
    0
  ).getDate();
  target.setDate(Math.min(day, daysInTarget));
  return toDateString(target);
}

function monthLabel(year: number, month: number): string {
  return new Date(year, month, 1).toLocaleString(undefined, {
    month: 'long',
    year: 'numeric',
  });
}

function localeWeekStart(): number {
  try {
    const locale = new Intl.Locale(navigator.language) as Intl.Locale & {
      weekInfo?: { firstDay?: number };
      getWeekInfo?: () => { firstDay?: number };
    };
    const info = locale.weekInfo ?? locale.getWeekInfo?.();
    if (info?.firstDay) return info.firstDay % 7;
  } catch {
    // Older engines — fall through.
  }
  return 0;
}

function weekdayLabels(weekStart: number): string[] {
  const format = new Intl.DateTimeFormat(undefined, { weekday: 'short' });
  return Array.from({ length: 7 }, (_, i) =>
    format.format(new Date(2021, 7, 1 + ((weekStart + i) % 7)))
  );
}

interface CalCell {
  date: string;
  day: number;
  inMonth: boolean;
}

function buildMonthWeeks(
  year: number,
  month: number,
  weekStart: number
): CalCell[][] {
  const firstWeekday = (new Date(year, month, 1).getDay() - weekStart + 7) % 7;
  const start = new Date(year, month, 1 - firstWeekday);
  const weeks: CalCell[][] = [];
  for (let week = 0; week < 6; week += 1) {
    const row: CalCell[] = [];
    for (let col = 0; col < 7; col += 1) {
      const cell = new Date(
        start.getFullYear(),
        start.getMonth(),
        start.getDate() + week * 7 + col
      );
      row.push({
        date: toDateString(cell),
        day: cell.getDate(),
        inMonth: cell.getMonth() === month,
      });
    }
    weeks.push(row);
  }
  return weeks;
}

function yearOptions(centerYear: number, minYear: number): number[] {
  const start = Math.max(minYear, centerYear - Math.floor(YEAR_WINDOW / 2));
  return Array.from({ length: YEAR_WINDOW }, (_, i) => start + i);
}

function formatDayLabel(ymd: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return '';
  const date = parseDateString(ymd);
  if (!Number.isFinite(date.getTime())) return '';
  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function fromToday(days: number): string {
  return addDays(todayDateString(), days);
}

export function AppDateSheet({
  open,
  value,
  min,
  label = 'Date',
  confirmLabel,
  onClose,
  onChange,
  zIndex = SHEET_Z.confirm,
}: {
  open: boolean;
  /** Local `YYYY-MM-DD`. */
  value: string;
  /** Inclusive minimum day (`YYYY-MM-DD`). Defaults to today. */
  min?: string;
  label?: string;
  confirmLabel?: string;
  onClose: () => void;
  onChange: (ymd: string) => void;
  zIndex?: number;
}) {
  const titleId = useId();
  const minDate = min?.trim() || todayDateString();
  const today = todayDateString();

  const seedDate = useMemo(() => {
    const raw = value.trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw) && raw >= minDate) return raw;
    return minDate > today ? minDate : today;
  }, [value, minDate, today]);

  const [draftDate, setDraftDate] = useState(seedDate);
  const [viewYear, setViewYear] = useState(Number(seedDate.slice(0, 4)));
  const [viewMonth, setViewMonth] = useState(Number(seedDate.slice(5, 7)) - 1);
  const [focusDate, setFocusDate] = useState(seedDate);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [closing, setClosing] = useState(false);
  const gridRef = useRef<HTMLDivElement>(null);
  const pendingFocusRef = useRef<string | null>(null);

  const sheetOpen = open && !closing;

  useEffect(() => {
    if (!open) {
      setClosing(false);
      return;
    }
    // Re-seed only when the sheet opens — not when Apply writes `value`
    // back into the parent (that would clear `closing` and force a second tap).
    setDraftDate(seedDate);
    setViewYear(Number(seedDate.slice(0, 4)));
    setViewMonth(Number(seedDate.slice(5, 7)) - 1);
    setFocusDate(seedDate);
    setPickerOpen(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- open edge only
  }, [open]);

  useEffect(() => {
    const target = pendingFocusRef.current;
    if (!target) return;
    pendingFocusRef.current = null;
    gridRef.current
      ?.querySelector<HTMLButtonElement>(`[data-date="${target}"]`)
      ?.focus();
  });

  const minYear = Number(minDate.slice(0, 4));
  const years = yearOptions(viewYear, minYear);
  const weekStart = localeWeekStart();
  const weekdays = weekdayLabels(weekStart);
  const weeks = buildMonthWeeks(viewYear, viewMonth, weekStart);
  const draftInvalid = !draftDate || draftDate < minDate;
  const actionLabel = confirmLabel ?? `Set ${label.toLowerCase()}`;

  const isDayBlocked = (date: string) => date < minDate;

  const requestClose = () => {
    if (closing) return;
    setClosing(true);
  };

  const handleClosed = () => {
    setClosing(false);
    onClose();
  };

  const shiftMonth = (delta: number) => {
    const next = new Date(viewYear, viewMonth + delta, 1);
    setViewYear(next.getFullYear());
    setViewMonth(next.getMonth());
    setPickerOpen(false);
  };

  const firstOfMonth = `${viewYear}-${pad(viewMonth + 1)}-01`;
  const dateInView = (date: string) =>
    weeks.some((week) => week.some((cell) => cell.date === date));
  const gridFocusDate = dateInView(focusDate)
    ? focusDate
    : dateInView(draftDate)
      ? draftDate
      : firstOfMonth;

  const moveFocusTo = (next: string) => {
    setFocusDate(next);
    setViewYear(Number(next.slice(0, 4)));
    setViewMonth(Number(next.slice(5, 7)) - 1);
    pendingFocusRef.current = next;
  };

  const handleGridKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    let next: string | null = null;
    switch (event.key) {
      case 'ArrowLeft':
        next = addDays(gridFocusDate, -1);
        break;
      case 'ArrowRight':
        next = addDays(gridFocusDate, 1);
        break;
      case 'ArrowUp':
        next = addDays(gridFocusDate, -7);
        break;
      case 'ArrowDown':
        next = addDays(gridFocusDate, 7);
        break;
      case 'Home': {
        const weekday =
          (parseDateString(gridFocusDate).getDay() - weekStart + 7) % 7;
        next = addDays(gridFocusDate, -weekday);
        break;
      }
      case 'End': {
        const weekday =
          (parseDateString(gridFocusDate).getDay() - weekStart + 7) % 7;
        next = addDays(gridFocusDate, 6 - weekday);
        break;
      }
      case 'PageUp':
        next = addMonths(gridFocusDate, -1);
        break;
      case 'PageDown':
        next = addMonths(gridFocusDate, 1);
        break;
      default:
        return;
    }
    event.preventDefault();
    if (next) moveFocusTo(next);
  };

  const applyPreset = (ymd: string) => {
    onChange(ymd);
    requestClose();
  };

  return (
    <OsHugSheet
      open={sheetOpen}
      onClose={requestClose}
      onClosed={handleClosed}
      label={label}
      copy={draftDate ? formatDayLabel(draftDate) : undefined}
      closeAriaLabel={`Close ${label.toLowerCase()} picker`}
      backdropLabel={`Close ${label.toLowerCase()} picker`}
      zIndex={zIndex}
      presentation="enter"
      titleId={titleId}
      panelClassName="drop-schedule-sheet-panel os-sheet-cap-tall"
      bodyClassName="drop-schedule-sheet-body"
      footer={
        <OsSheetFooter>
          <OsSheetActions layout="stack" tone="frosted-primary" borderless>
            <OsSheetAction
              type="button"
              ready={!draftInvalid}
              disabled={draftInvalid}
              onClick={() => {
                if (draftInvalid) return;
                onChange(draftDate);
                requestClose();
              }}
            >
              {actionLabel}
            </OsSheetAction>
          </OsSheetActions>
        </OsSheetFooter>
      }
    >
      <div className="drop-schedule-sheet">
        <div
          className="app-storage-presets"
          role="group"
          aria-label="Quick dates"
        >
          {[
            { label: '7 days', value: fromToday(7) },
            { label: '14 days', value: fromToday(14) },
            { label: '30 days', value: fromToday(30) },
          ].map((preset) => (
            <button
              key={preset.label}
              type="button"
              className={`os-surface-chip${
                draftDate === preset.value ? ' is-selected' : ''
              }`}
              onClick={() => applyPreset(preset.value)}
            >
              {preset.label}
            </button>
          ))}
        </div>

        <div className="drop-cal">
          <div className="drop-cal-nav">
            <button
              type="button"
              className="drop-cal-nav-btn"
              aria-label="Previous month"
              onClick={() => shiftMonth(-1)}
            >
              <ChevronLeftIcon className="drop-cal-nav-icon" aria-hidden />
            </button>
            <button
              type="button"
              className={`drop-cal-month-btn${pickerOpen ? ' is-open' : ''}`}
              aria-expanded={pickerOpen}
              aria-controls={`${titleId}-picker`}
              onClick={() => setPickerOpen((next) => !next)}
            >
              <span className="drop-cal-month">
                {monthLabel(viewYear, viewMonth)}
              </span>
              <ChevronDownIcon className="drop-cal-month-chevron" aria-hidden />
            </button>
            <button
              type="button"
              className="drop-cal-nav-btn"
              aria-label="Next month"
              onClick={() => shiftMonth(1)}
            >
              <ChevronRightIcon className="drop-cal-nav-icon" aria-hidden />
            </button>
          </div>

          {pickerOpen ? (
            <div
              id={`${titleId}-picker`}
              className="drop-cal-picker"
              role="group"
              aria-label="Choose month and year"
            >
              <div className="drop-cal-year-row">
                <button
                  type="button"
                  className="drop-cal-nav-btn"
                  aria-label="Earlier years"
                  disabled={years[0] <= minYear}
                  onClick={() =>
                    setViewYear((y) => Math.max(minYear, y - YEAR_WINDOW))
                  }
                >
                  <ChevronLeftIcon className="drop-cal-nav-icon" aria-hidden />
                </button>
                <div
                  className="drop-cal-year-chips"
                  role="listbox"
                  aria-label="Year"
                >
                  {years.map((year) => (
                    <button
                      key={year}
                      type="button"
                      role="option"
                      aria-selected={year === viewYear}
                      className={`drop-cal-chip${
                        year === viewYear ? ' is-selected' : ''
                      }`}
                      onClick={() => setViewYear(year)}
                    >
                      {year}
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  className="drop-cal-nav-btn"
                  aria-label="Later years"
                  onClick={() => setViewYear((y) => y + YEAR_WINDOW)}
                >
                  <ChevronRightIcon className="drop-cal-nav-icon" aria-hidden />
                </button>
              </div>
              <div
                className="drop-cal-month-chips"
                role="listbox"
                aria-label="Month"
              >
                {Array.from({ length: 12 }, (_, month) => (
                  <button
                    key={month}
                    type="button"
                    role="option"
                    aria-selected={month === viewMonth}
                    className={`drop-cal-chip${
                      month === viewMonth ? ' is-selected' : ''
                    }`}
                    onClick={() => {
                      setViewMonth(month);
                      setPickerOpen(false);
                    }}
                  >
                    {new Date(2021, month, 1).toLocaleString(undefined, {
                      month: 'short',
                    })}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <>
              <div className="drop-cal-weekdays" aria-hidden>
                {weekdays.map((day) => (
                  <span key={day}>{day}</span>
                ))}
              </div>
              <div
                ref={gridRef}
                className="drop-cal-grid"
                role="grid"
                aria-label="Choose a day"
                onKeyDown={handleGridKeyDown}
              >
                {weeks.map((week, weekIndex) => (
                  <div
                    key={`w-${weekIndex}`}
                    role="row"
                    className="drop-cal-week"
                  >
                    {week.map((cell) => {
                      const selected = cell.date === draftDate;
                      const blocked = isDayBlocked(cell.date);
                      const isToday = cell.date === today;
                      return (
                        <button
                          key={cell.date}
                          data-date={cell.date}
                          type="button"
                          role="gridcell"
                          aria-selected={selected}
                          aria-disabled={blocked || undefined}
                          tabIndex={cell.date === gridFocusDate ? 0 : -1}
                          className={`drop-cal-day${
                            selected ? ' is-selected' : ''
                          }${isToday ? ' is-today' : ''}${
                            !cell.inMonth ? ' is-outside' : ''
                          }${blocked ? ' is-disabled' : ''}`}
                          onClick={() => {
                            if (blocked) return;
                            setDraftDate(cell.date);
                            setFocusDate(cell.date);
                            if (!cell.inMonth) {
                              setViewYear(Number(cell.date.slice(0, 4)));
                              setViewMonth(Number(cell.date.slice(5, 7)) - 1);
                            }
                          }}
                        >
                          {cell.day}
                        </button>
                      );
                    })}
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </OsHugSheet>
  );
}

export function formatAppDateFieldLabel(ymd: string): string {
  return formatDayLabel(ymd) || 'Pick a day';
}
