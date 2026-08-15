import type { ScarcesEventRow } from '@onsocial/sdk';
import { SCARCES_EVENT_TYPES } from '@onsocial/sdk';
import { formatMarketRelativeTime } from '@/features/market/market-listings';
import {
  ticketPassSeatLabel,
  type PassStaffVoice,
} from '@/features/scarces/ticket-pass-payload';
import { createReadOnlyOnSocialClient } from '@/lib/create-readonly-onsocial-client';

export interface DoorLogEntry {
  key: string;
  tokenId: string;
  seatLabel: string;
  /** Pass holder at admit time. */
  guestId: string;
  /** Staff wallet that called redeem (tx author). */
  staffId: string;
  blockTimestamp: number;
  /** Relative time — e.g. `2m ago`. */
  timeLabel: string;
  /** Calendar + clock — e.g. `Aug 15 · 2:34 PM`. */
  timeAbsolute: string;
  redeemCount: number | null;
  maxRedeems: number | null;
}

function asOptionalInt(value: unknown): number | null {
  if (value == null || value === '') return null;
  const n = Math.floor(Number(value));
  return Number.isFinite(n) && n >= 0 ? n : null;
}

function timestampMs(timestamp: number): number {
  if (!Number.isFinite(timestamp) || timestamp <= 0) return 0;
  return timestamp > 1e15 ? Math.floor(timestamp / 1e6) : timestamp;
}

/** Absolute door-log clock for disputes / overnight ops — `Aug 15 · 2:34 PM`. */
export function formatDoorLogAbsoluteTime(
  timestamp: number,
  nowMs: number = Date.now()
): string {
  const ms = timestampMs(timestamp);
  if (!ms) return '';
  const date = new Date(ms);
  const sameYear = date.getFullYear() === new Date(nowMs).getFullYear();
  const day = new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    ...(sameYear ? {} : { year: 'numeric' }),
  }).format(date);
  const clock = new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  }).format(date);
  return `${day} · ${clock}`;
}

/** ISO for `<time dateTime>` when the indexer stamp is valid. */
export function doorLogEntryIso(timestamp: number): string | undefined {
  const ms = timestampMs(timestamp);
  if (!ms) return undefined;
  return new Date(ms).toISOString();
}

/** Map indexer redeem rows → Door log entries (newest first preserved). */
export function mapDoorLogEntries(
  rows: ScarcesEventRow[],
  nowMs: number = Date.now()
): DoorLogEntry[] {
  const out: DoorLogEntry[] = [];
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]!;
    if ((row.operation ?? '').trim() !== 'redeem') continue;
    const tokenId = row.tokenId?.trim() || '';
    const guestId = row.ownerId?.trim() || '';
    const staffId = row.author?.trim() || '';
    if (!tokenId || !guestId || !staffId) continue;
    const blockTimestamp = Number(row.blockTimestamp) || 0;
    out.push({
      key: `${tokenId}:${blockTimestamp}:${staffId}:${i}`,
      tokenId,
      seatLabel: ticketPassSeatLabel(tokenId),
      guestId,
      staffId,
      blockTimestamp,
      timeLabel: formatMarketRelativeTime(blockTimestamp, nowMs) ?? '',
      timeAbsolute: formatDoorLogAbsoluteTime(blockTimestamp, nowMs),
      redeemCount: asOptionalInt(row.redeemCount),
      maxRedeems: asOptionalInt(row.maxRedeems),
    });
  }
  return out;
}

/** Seat (+ multi-redeem) line under the guest name. */
export function doorLogEntrySeatLine(entry: DoorLogEntry): string {
  const multi =
    entry.maxRedeems != null &&
    entry.maxRedeems > 1 &&
    entry.redeemCount != null
      ? ` · ${entry.redeemCount}/${entry.maxRedeems}`
      : '';
  return `${entry.seatLabel}${multi}`;
}

export function doorLogStaffVerb(voice: PassStaffVoice = 'admit'): string {
  return voice === 'redeem' ? 'Redeemed by' : 'Admitted by';
}

/**
 * Quiet one-line meta (tests + compact surfaces).
 * UI prefers seat line + linked staff separately.
 */
export function doorLogEntryMeta(
  entry: DoorLogEntry,
  staffLabel: string,
  voice: PassStaffVoice = 'admit'
): string {
  const by = staffLabel.trim() || entry.staffId;
  return `${doorLogEntrySeatLine(entry)} · ${doorLogStaffVerb(voice)} ${by}`;
}

/** Filter by guest, staff, seat, or display names. */
export function filterDoorLogEntries(
  entries: DoorLogEntry[],
  query: string,
  nameByAccount?: Record<string, string | null | undefined>
): DoorLogEntry[] {
  const q = query.trim().toLowerCase();
  if (!q) return entries;
  return entries.filter((entry) => {
    const guestName =
      nameByAccount?.[entry.guestId]?.trim().toLowerCase() ?? '';
    const staffName =
      nameByAccount?.[entry.staffId]?.trim().toLowerCase() ?? '';
    return (
      entry.guestId.toLowerCase().includes(q) ||
      entry.staffId.toLowerCase().includes(q) ||
      entry.seatLabel.toLowerCase().includes(q) ||
      entry.tokenId.toLowerCase().includes(q) ||
      guestName.includes(q) ||
      staffName.includes(q)
    );
  });
}

/** Newest redeem / check-in events for a drop. */
export async function fetchCollectionDoorLog(
  collectionId: string,
  opts?: { limit?: number }
): Promise<DoorLogEntry[]> {
  const id = collectionId.trim();
  if (!id) return [];
  const client = createReadOnlyOnSocialClient();
  const rows = await client.query.scarces.events({
    eventType: SCARCES_EVENT_TYPES.SCARCE,
    operation: 'redeem',
    collectionId: id,
    limit: opts?.limit ?? 80,
  });
  return mapDoorLogEntries(rows);
}
