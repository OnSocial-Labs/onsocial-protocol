'use client';

/**
 * Sale-window picker — hug sheet with quick chips + an in-app calendar.
 * Keeps exact open/close times without the browser's square datetime chrome.
 */

import {
  useCallback,
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
} from '@onsocial/ui';
import { SHEET_Z } from '@/lib/sheet-z';

export type SaleWindowField =
  | 'opens'
  | 'closes'
  | 'access'
  | 'eventStarts'
  | 'eventEnds';

const YEAR_WINDOW = 6;
/** Visible drum rows — keep in sync with `.drop-time-drum` CSS. */
const TIME_DRUM_VISIBLE = 5;

interface DropSaleWindowSheetProps {
  open: boolean;
  field: SaleWindowField | null;
  value: string;
  /** Exclusive lower bound (datetime-local) — e.g. Opens when picking Closes. */
  minValue?: string;
  /** Exclusive upper bound (datetime-local) — e.g. Closes when picking Opens. */
  maxValue?: string;
  onClose: () => void;
  onChange: (value: string) => void;
}

interface SheetSession {
  id: number;
  field: SaleWindowField;
  value: string;
  minValue?: string;
  maxValue?: string;
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

export function toDatetimeLocalValue(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/**
 * Calendar-aware "from now" — adds wall-clock units so presets stay correct
 * across DST shifts and leap years (unlike fixed-millisecond offsets).
 */
function fromNow(parts: {
  hours?: number;
  days?: number;
  years?: number;
}): string {
  const date = new Date();
  if (parts.hours) date.setHours(date.getHours() + parts.hours);
  if (parts.days) date.setDate(date.getDate() + parts.days);
  if (parts.years) date.setFullYear(date.getFullYear() + parts.years);
  return toDatetimeLocalValue(date);
}

export function formatScheduleLabel(value: string): string {
  if (!value.trim()) return '';
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return value;
  // Always include year — schedule times are absolute, not “this month.”
  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function localDateTimeToNs(value: string): string | undefined {
  if (!value.trim()) return undefined;
  const ms = new Date(value).getTime();
  if (!Number.isFinite(ms)) return undefined;
  // ms * 1e6 exceeds Number.MAX_SAFE_INTEGER — must convert via BigInt.
  return (BigInt(ms) * 1_000_000n).toString();
}

/** Token metadata `expires_at` uses milliseconds since epoch. */
export function localDateTimeToMs(value: string): number | undefined {
  if (!value.trim()) return undefined;
  const ms = new Date(value).getTime();
  if (!Number.isFinite(ms)) return undefined;
  return ms;
}

function splitLocal(value: string): { date: string; time: string } {
  if (!value.includes('T')) {
    const now = toDatetimeLocalValue(new Date());
    const [date, time] = now.split('T');
    return { date, time };
  }
  const [date, time = '12:00'] = value.split('T');
  return { date, time: time.slice(0, 5) };
}

function joinLocal(date: string, time: string): string {
  return `${date}T${time}`;
}

/** Local calendar day as YYYY-MM-DD. */
function todayDateString(): string {
  return toDatetimeLocalValue(new Date()).slice(0, 10);
}

function isPastCalendarDay(date: string): boolean {
  return date < todayDateString();
}

/** Close times must be strictly in the future. */
function isPastDateTime(date: string, time: string): boolean {
  const ms = new Date(joinLocal(date, time)).getTime();
  return !Number.isFinite(ms) || ms <= Date.now();
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

/** First day of week for the user's locale: 0 = Sunday … 6 = Saturday. */
function localeWeekStart(): number {
  try {
    const locale = new Intl.Locale(navigator.language) as Intl.Locale & {
      weekInfo?: { firstDay?: number };
      getWeekInfo?: () => { firstDay?: number };
    };
    const info = locale.weekInfo ?? locale.getWeekInfo?.();
    // Intl weekInfo uses 1 = Monday … 7 = Sunday.
    if (info?.firstDay) return info.firstDay % 7;
  } catch {
    // Older engines without Intl.Locale weekInfo — fall through.
  }
  return 0;
}

function weekdayLabels(weekStart: number): string[] {
  const format = new Intl.DateTimeFormat(undefined, { weekday: 'short' });
  // Aug 1 2021 was a Sunday — offset from it to render each weekday name.
  return Array.from({ length: 7 }, (_, i) =>
    format.format(new Date(2021, 7, 1 + ((weekStart + i) % 7)))
  );
}

function formatTimeChip(time: string): string {
  const [hours, minutes] = time.split(':').map(Number);
  return new Date(2021, 0, 1, hours, minutes).toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  });
}

function splitTime(time: string): { hour: number; minute: number } {
  const [hour = 0, minute = 0] = time.split(':').map(Number);
  return {
    hour: Number.isFinite(hour) ? hour : 0,
    minute: Number.isFinite(minute) ? minute : 0,
  };
}

function joinTime(hour: number, minute: number): string {
  return `${pad(((hour % 24) + 24) % 24)}:${pad(((minute % 60) + 60) % 60)}`;
}

function formatHourOption(hour24: number): string {
  return new Date(2021, 0, 1, hour24, 0).toLocaleTimeString(undefined, {
    hour: 'numeric',
  });
}

function minutesBlockedForHour(
  hour: number,
  isBlocked: (time: string) => boolean
): boolean[] {
  return Array.from({ length: 60 }, (_, minute) =>
    isBlocked(joinTime(hour, minute))
  );
}

/** Nearest unblocked minute in the given hour, preferring `preferred`. */
function nearestOpenMinute(
  preferred: number,
  minuteBlocked: readonly boolean[]
): number | null {
  const start = ((preferred % 60) + 60) % 60;
  for (let distance = 0; distance < 60; distance += 1) {
    const up = (start + distance) % 60;
    if (!minuteBlocked[up]) return up;
    if (distance === 0) continue;
    const down = (start - distance + 60) % 60;
    if (!minuteBlocked[down]) return down;
  }
  return null;
}

/** Snap a stored time onto the nearest open slot (date/min/max may have moved). */
function resolveOpenTime(
  value: string,
  isBlocked: (time: string) => boolean
): { hour: number; minute: number; adjusted: boolean } {
  const seed = splitTime(value);
  if (!isBlocked(joinTime(seed.hour, seed.minute))) {
    return { ...seed, adjusted: false };
  }
  for (let offset = 0; offset < 24; offset += 1) {
    const hour = (seed.hour + offset) % 24;
    const snapped = nearestOpenMinute(
      seed.minute,
      minutesBlockedForHour(hour, isBlocked)
    );
    if (snapped != null) {
      return { hour, minute: snapped, adjusted: true };
    }
  }
  return { ...seed, adjusted: false };
}

function drumItemHeight(list: HTMLElement): number {
  const option = list.querySelector<HTMLElement>('[data-drum-index]');
  return option?.offsetHeight || Math.round(list.clientHeight / TIME_DRUM_VISIBLE);
}

function scrollDrumToIndex(
  list: HTMLElement | null,
  index: number,
  suppress?: { current: boolean }
) {
  if (!list) return;
  if (suppress) suppress.current = true;
  const itemH = drumItemHeight(list);
  list.scrollTop = index * itemH;
  if (suppress) {
    requestAnimationFrame(() => {
      suppress.current = false;
    });
  }
}

function readDrumIndex(list: HTMLElement): number {
  const itemH = drumItemHeight(list);
  if (itemH <= 0) return 0;
  return Math.max(0, Math.round(list.scrollTop / itemH));
}

interface CalCell {
  date: string;
  day: number;
  /** False for leading/trailing days from the adjacent month (muted). */
  inMonth: boolean;
}

function buildMonthWeeks(
  year: number,
  month: number,
  weekStart: number
): CalCell[][] {
  const firstWeekday =
    (new Date(year, month, 1).getDay() - weekStart + 7) % 7;
  // Anchor on the first visible cell (may be in the previous month).
  const start = new Date(year, month, 1 - firstWeekday);
  const weeks: CalCell[][] = [];
  // Always 6 weeks so height stays stable across months.
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

function initialDraft(_field: SaleWindowField, value: string) {
  let next = splitLocal(value || toDatetimeLocalValue(new Date()));
  // Any set schedule time must be in the future — clamp past days to today.
  if (isPastCalendarDay(next.date)) {
    next = { date: todayDateString(), time: next.time };
  }
  return {
    date: next.date,
    time: next.time,
    viewYear: Number(next.date.slice(0, 4)),
    viewMonth: Number(next.date.slice(5, 7)) - 1,
  };
}

function yearOptions(centerYear: number, minYear: number): number[] {
  const start = Math.max(minYear, centerYear - 1);
  return Array.from({ length: YEAR_WINDOW }, (_, i) => start + i);
}

interface DropTimePickerSheetProps {
  open: boolean;
  value: string;
  isBlocked: (time: string) => boolean;
  onClose: () => void;
  onClosed: () => void;
  onChange: (time: string) => void;
}

/**
 * Nested hour/minute drum — content-hugging glass sheet like ChoiceDrawer.
 * Local draft only while open; Set time commits into the parent and closes.
 * X / backdrop discards. Snaps onto an open slot if the stored time is blocked.
 */
function DropTimePickerSheet({
  open,
  value,
  isBlocked,
  onClose,
  onClosed,
  onChange,
}: DropTimePickerSheetProps) {
  const titleId = useId();
  const hourListRef = useRef<HTMLDivElement>(null);
  const minuteListRef = useRef<HTMLDivElement>(null);
  const hourScrollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const minuteScrollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ignoreHourScroll = useRef(false);
  const ignoreMinuteScroll = useRef(false);
  // Parent remounts via `key` each open so draft seeds from `value`.
  const seed = resolveOpenTime(value, isBlocked);
  const [hour, setHour] = useState(seed.hour);
  const [minute, setMinute] = useState(seed.minute);


  const hourBlocked = useMemo(() => {
    return Array.from({ length: 24 }, (_, nextHour) =>
      minutesBlockedForHour(nextHour, isBlocked).every(Boolean)
    );
  }, [isBlocked]);

  const minuteBlocked = useMemo(
    () => minutesBlockedForHour(hour, isBlocked),
    [hour, isBlocked]
  );

  const draft = joinTime(hour, minute);
  const draftBlocked = isBlocked(draft);

  const setDraft = useCallback(
    (nextHour: number, nextMinute: number) => {
      const next = joinTime(nextHour, nextMinute);
      if (isBlocked(next)) return false;
      setHour((prev) => (prev === nextHour ? prev : nextHour));
      setMinute((prev) => (prev === nextMinute ? prev : nextMinute));
      return true;
    },
    [isBlocked]
  );

  useEffect(() => {
    if (!open) return;
    scrollDrumToIndex(hourListRef.current, hour, ignoreHourScroll);
    scrollDrumToIndex(minuteListRef.current, minute, ignoreMinuteScroll);
  }, [open, hour, minute]);

  useEffect(
    () => () => {
      if (hourScrollTimer.current) clearTimeout(hourScrollTimer.current);
      if (minuteScrollTimer.current) clearTimeout(minuteScrollTimer.current);
    },
    []
  );

  const settleHour = useCallback(() => {
    const list = hourListRef.current;
    if (!list) return;
    let nextHour = Math.min(23, readDrumIndex(list));
    if (hourBlocked[nextHour]) {
      for (let distance = 1; distance < 24; distance += 1) {
        const up = (nextHour + distance) % 24;
        if (!hourBlocked[up]) {
          nextHour = up;
          break;
        }
        const down = (nextHour - distance + 24) % 24;
        if (!hourBlocked[down]) {
          nextHour = down;
          break;
        }
      }
    }
    const snapped = nearestOpenMinute(
      minute,
      minutesBlockedForHour(nextHour, isBlocked)
    );
    if (snapped == null) return;
    scrollDrumToIndex(list, nextHour, ignoreHourScroll);
    if (snapped !== minute) {
      scrollDrumToIndex(minuteListRef.current, snapped, ignoreMinuteScroll);
    }
    setDraft(nextHour, snapped);
  }, [hourBlocked, isBlocked, minute, setDraft]);

  const settleMinute = useCallback(() => {
    const list = minuteListRef.current;
    if (!list) return;
    let nextMinute = Math.min(59, readDrumIndex(list));
    if (minuteBlocked[nextMinute]) {
      const snapped = nearestOpenMinute(nextMinute, minuteBlocked);
      if (snapped == null) return;
      nextMinute = snapped;
    }
    scrollDrumToIndex(list, nextMinute, ignoreMinuteScroll);
    setDraft(hour, nextMinute);
  }, [hour, minuteBlocked, setDraft]);

  const onHourScroll = () => {
    if (ignoreHourScroll.current) return;
    if (hourScrollTimer.current) clearTimeout(hourScrollTimer.current);
    hourScrollTimer.current = setTimeout(settleHour, 80);
  };

  const onMinuteScroll = () => {
    if (ignoreMinuteScroll.current) return;
    if (minuteScrollTimer.current) clearTimeout(minuteScrollTimer.current);
    minuteScrollTimer.current = setTimeout(settleMinute, 80);
  };

  return (
    <OsHugSheet
      open={open}
      onClose={onClose}
      onClosed={onClosed}
      label="Time"
      copy={`${formatTimeChip(draft)} · local`}
      closeAriaLabel="Close time"
      backdropLabel="Close time picker"
      zIndex={SHEET_Z.nested}
      titleId={titleId}
      panelClassName="drop-time-sheet-panel os-sheet-cap-short"
      bodyClassName="drop-time-sheet-body"
      footer={
        <div className="drop-schedule-sheet-footer">
          <OsSheetActions layout="stack" tone="frosted-primary" borderless>
            <OsSheetAction
              type="button"
              ready={!draftBlocked}
              disabled={draftBlocked}
              onClick={() => {
                if (draftBlocked) return;
                onChange(draft);
                onClose();
              }}
            >
              Set time
            </OsSheetAction>
          </OsSheetActions>
        </div>
      }
    >
      <div className="drop-time-sheet" role="group" aria-label="Hour and minute">
        <div className="drop-time-drums">
          <div className="drop-time-drum">
            <p className="drop-time-column-label">Hour</p>
            <div className="drop-time-drum-frame">
              <div className="drop-time-drum-band" aria-hidden />
              <div
                ref={hourListRef}
                className="drop-time-drum-list"
                role="listbox"
                aria-label="Hour"
                aria-activedescendant={`drop-time-hour-${hour}`}
                onScroll={onHourScroll}
              >
                {Array.from({ length: 24 }, (_, nextHour) => {
                  const blocked = hourBlocked[nextHour];
                  const selected = nextHour === hour;
                  return (
                    <button
                      key={nextHour}
                      id={`drop-time-hour-${nextHour}`}
                      type="button"
                      role="option"
                      data-drum-index={nextHour}
                      aria-selected={selected}
                      disabled={blocked}
                      className={`drop-time-drum-option${
                        selected ? ' is-selected' : ''
                      }`}
                      onClick={() => {
                        if (blocked) return;
                        const snapped = nearestOpenMinute(
                          minute,
                          minutesBlockedForHour(nextHour, isBlocked)
                        );
                        if (snapped == null) return;
                        setDraft(nextHour, snapped);
                      }}
                    >
                      {formatHourOption(nextHour)}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
          <div className="drop-time-drum">
            <p className="drop-time-column-label">Minute</p>
            <div className="drop-time-drum-frame">
              <div className="drop-time-drum-band" aria-hidden />
              <div
                ref={minuteListRef}
                className="drop-time-drum-list"
                role="listbox"
                aria-label="Minute"
                aria-activedescendant={`drop-time-minute-${minute}`}
                onScroll={onMinuteScroll}
              >
                {Array.from({ length: 60 }, (_, nextMinute) => {
                  const blocked = minuteBlocked[nextMinute];
                  const selected = nextMinute === minute;
                  return (
                    <button
                      key={nextMinute}
                      id={`drop-time-minute-${nextMinute}`}
                      type="button"
                      role="option"
                      data-drum-index={nextMinute}
                      aria-selected={selected}
                      disabled={blocked}
                      className={`drop-time-drum-option${
                        selected ? ' is-selected' : ''
                      }`}
                      onClick={() => {
                        if (blocked) return;
                        setDraft(hour, nextMinute);
                      }}
                    >
                      {pad(nextMinute)}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </div>
    </OsHugSheet>
  );
}

interface DraftBodyProps {
  open: boolean;
  field: SaleWindowField;
  initialValue: string;
  minValue?: string;
  maxValue?: string;
  titleId: string;
  onRequestClose: () => void;
  onClosed: () => void;
  onApply: (value: string) => void;
}

/**
 * Draft state lives here and remounts via `key` on each open session —
 * no effect sync and no refs-during-render. Parent keeps this mounted
 * through the sheet exit animation.
 */
function DropSaleWindowDraftBody({
  open,
  field,
  initialValue,
  minValue,
  maxValue,
  titleId,
  onRequestClose,
  onClosed,
  onApply,
}: DraftBodyProps) {
  const seed = initialDraft(field, initialValue);
  const [draftDate, setDraftDate] = useState(seed.date);
  const [draftTime, setDraftTime] = useState(seed.time);
  const [viewYear, setViewYear] = useState(seed.viewYear);
  const [viewMonth, setViewMonth] = useState(seed.viewMonth);
  const [focusDate, setFocusDate] = useState(seed.date);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [timeSheetOpen, setTimeSheetOpen] = useState(false);
  const [timeSheetClosing, setTimeSheetClosing] = useState(false);
  const [timeSheetSession, setTimeSheetSession] = useState(0);
  const gridRef = useRef<HTMLDivElement>(null);
  const pendingFocusRef = useRef<string | null>(null);
  const timeSheetVisible = timeSheetOpen || timeSheetClosing;
  const timeSheetActive = timeSheetOpen && !timeSheetClosing;

  // Move DOM focus after keyboard navigation re-renders the grid.
  useEffect(() => {
    const target = pendingFocusRef.current;
    if (!target) return;
    pendingFocusRef.current = null;
    gridRef.current
      ?.querySelector<HTMLButtonElement>(`[data-date="${target}"]`)
      ?.focus();
  });

  const now = new Date();
  const currentYear = now.getFullYear();
  // No past years — open/close/access are all future (or clear = Now / No end).
  const minYear = currentYear;
  const years = yearOptions(viewYear, minYear);
  const weekStart = localeWeekStart();
  const weekdays = weekdayLabels(weekStart);
  const weeks = buildMonthWeeks(viewYear, viewMonth, weekStart);

  const title =
    field === 'closes'
      ? 'Closes'
      : field === 'access'
        ? 'Access ends'
        : field === 'eventStarts'
          ? 'Event starts'
          : field === 'eventEnds'
            ? 'Event ends'
            : 'Opens';
  const clearLabel =
    field === 'opens' || field === 'eventStarts' ? 'Clear' : 'No end';
  const presets =
    field === 'access'
      ? ([
          { label: '30 days', value: () => fromNow({ days: 30 }) },
          { label: '90 days', value: () => fromNow({ days: 90 }) },
          { label: '1 year', value: () => fromNow({ years: 1 }) },
        ] as const)
      : field === 'closes' || field === 'eventEnds'
        ? ([
            { label: '24h', value: () => fromNow({ hours: 24 }) },
            { label: '7 days', value: () => fromNow({ days: 7 }) },
          ] as const)
        : ([
            { label: '1h', value: () => fromNow({ hours: 1 }) },
            { label: '24h', value: () => fromNow({ hours: 24 }) },
          ] as const);

  const today = todayDateString();

  const isDayBlocked = useCallback(
    (date: string): boolean => {
      if (isPastCalendarDay(date)) return true;
      if (minValue && date < minValue.slice(0, 10)) return true;
      if (maxValue && date > maxValue.slice(0, 10)) return true;
      return false;
    },
    [minValue, maxValue]
  );

  const timeBlocked = useCallback(
    (time: string) => {
      if (isPastDateTime(draftDate, time)) return true;
      const joined = joinLocal(draftDate, time);
      if (minValue && joined <= minValue) return true;
      if (maxValue && joined >= maxValue) return true;
      return false;
    },
    [draftDate, minValue, maxValue]
  );

  const draft = joinLocal(draftDate, draftTime);
  const pastInvalid = isPastDateTime(draftDate, draftTime);
  const belowMin = Boolean(minValue && draft <= minValue);
  const aboveMax = Boolean(maxValue && draft >= maxValue);
  const draftInvalid = pastInvalid || belowMin || aboveMax;
  const pastError =
    field === 'access'
      ? 'Access end must be in the future.'
      : field === 'closes'
        ? 'Close time must be in the future.'
        : field === 'eventEnds'
          ? 'Event end must be in the future.'
          : field === 'eventStarts'
            ? 'Event start must be in the future.'
            : 'Open time must be in the future. Use Now to start immediately.';
  const draftError = belowMin
    ? field === 'eventEnds'
      ? 'Must be after the event start.'
      : 'Must be after the open time.'
    : aboveMax
      ? field === 'eventStarts'
        ? 'Must be before the event end.'
        : 'Must be before the close time.'
      : pastInvalid
        ? pastError
        : null;

  const closeTimeSheet = useCallback(() => {
    if (timeSheetClosing) return;
    setTimeSheetClosing(true);
  }, [timeSheetClosing]);

  const handleTimeSheetClosed = useCallback(() => {
    setTimeSheetClosing(false);
    setTimeSheetOpen(false);
  }, []);

  const shiftMonth = (delta: number) => {
    const next = new Date(viewYear, viewMonth + delta, 1);
    setViewYear(next.getFullYear());
    setViewMonth(next.getMonth());
    setPickerOpen(false);
  };

  // Roving tabindex — prefer focusDate if visible, else selected, else 1st.
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

  return (
    <>
    <OsHugSheet
      open={open}
      onClose={onRequestClose}
      onClosed={onClosed}
      label={title}
      copy={
        draftDate && draftTime
          ? formatScheduleLabel(joinLocal(draftDate, draftTime))
          : clearLabel
      }
      closeAriaLabel="Close"
      backdropLabel={`Close ${title.toLowerCase()} picker`}
      zIndex={SHEET_Z.list}
      presentation="enter"
      titleId={titleId}
      panelClassName="drop-schedule-sheet-panel os-sheet-cap-tall"
      bodyClassName="drop-schedule-sheet-body"
      footer={
        <div className="drop-schedule-sheet-footer">
          <OsSheetActions layout="stack" tone="frosted-primary" borderless>
            <OsSheetAction
              type="button"
              ready={!draftInvalid}
              disabled={draftInvalid}
              onClick={() => {
                if (draftInvalid) return;
                onApply(joinLocal(draftDate, draftTime));
              }}
            >
              Set {title.toLowerCase()}
            </OsSheetAction>
          </OsSheetActions>
        </div>
      }
    >
      <div className="drop-schedule-sheet">
        <div
          className="app-storage-presets"
          role="group"
          aria-label="Quick times"
        >
          <button
            type="button"
            className={`os-surface-chip${!initialValue ? ' is-selected' : ''}`}
            onClick={() => onApply('')}
          >
            {clearLabel}
          </button>
          {presets.map((preset) => (
            <button
              key={preset.label}
              type="button"
              className="os-surface-chip"
              onClick={() => onApply(preset.value())}
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
              aria-controls="drop-cal-picker"
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
              id="drop-cal-picker"
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
                            // Jump the header into the month you tapped.
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

        <div className="drop-schedule-time">
          <span className="drop-schedule-time-label">Time</span>
          <button
            type="button"
            className={`drop-schedule-time-field${
              timeSheetVisible ? ' is-open' : ''
            }`}
            aria-haspopup="dialog"
            aria-expanded={timeSheetActive}
            aria-label={`Time: ${formatTimeChip(draftTime)} local`}
            onClick={() => {
              setTimeSheetSession((id) => id + 1);
              setTimeSheetOpen(true);
            }}
          >
            <span className="drop-schedule-time-field-value">
              {formatTimeChip(draftTime)}
            </span>
            <span className="drop-schedule-time-field-suffix">local</span>
            <ChevronDownIcon
              className="drop-schedule-time-field-chevron"
              aria-hidden
            />
          </button>
          {draftError ? <small>{draftError}</small> : null}
        </div>
      </div>
    </OsHugSheet>

    {timeSheetVisible ? (
      <DropTimePickerSheet
        key={timeSheetSession}
        open={timeSheetActive}
        value={draftTime}
        isBlocked={timeBlocked}
        onClose={closeTimeSheet}
        onClosed={handleTimeSheetClosed}
        onChange={setDraftTime}
      />
    ) : null}
    </>
  );
}

export function DropSaleWindowSheet({
  open,
  field,
  value,
  minValue,
  maxValue,
  onClose,
  onChange,
}: DropSaleWindowSheetProps) {
  const titleId = useId();
  const [closing, setClosing] = useState(false);
  const [wasOpen, setWasOpen] = useState(false);
  const [session, setSession] = useState<SheetSession | null>(null);

  // Seed a new draft session when the sheet opens (or the field switches).
  // Keep the session mounted through the exit animation after close starts.
  let activeSession = session;
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open && field) {
      const next = {
        id: (session?.id ?? 0) + 1,
        field,
        value,
        minValue,
        maxValue,
      };
      setSession(next);
      setClosing(false);
      activeSession = next;
    }
  } else if (open && field && session && field !== session.field) {
    const next = {
      id: session.id + 1,
      field,
      value,
      minValue,
      maxValue,
    };
    setSession(next);
    activeSession = next;
  }

  const showSheet = activeSession != null && (open || closing);
  const sheetOpen = Boolean(open && !closing && activeSession);


  const requestClose = useCallback(() => {
    if (closing) return;
    setClosing(true);
  }, [closing]);

  const handleClosed = useCallback(() => {
    setClosing(false);
    setSession(null);
    onClose();
  }, [onClose]);

  const applyAndClose = useCallback(
    (next: string) => {
      onChange(next);
      requestClose();
    },
    [onChange, requestClose]
  );

  if (!activeSession || !showSheet) return null;

  return (
    <DropSaleWindowDraftBody
      key={activeSession.id}
      open={sheetOpen}
      field={activeSession.field}
      initialValue={activeSession.value}
      minValue={activeSession.minValue}
      maxValue={activeSession.maxValue}
      titleId={titleId}
      onRequestClose={requestClose}
      onClosed={handleClosed}
      onApply={applyAndClose}
    />
  );
}
