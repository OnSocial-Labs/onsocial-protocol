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
  timeLabel: string;
  redeemCount: number | null;
  maxRedeems: number | null;
}

function asOptionalInt(value: unknown): number | null {
  if (value == null || value === '') return null;
  const n = Math.floor(Number(value));
  return Number.isFinite(n) && n >= 0 ? n : null;
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
      redeemCount: asOptionalInt(row.redeemCount),
      maxRedeems: asOptionalInt(row.maxRedeems),
    });
  }
  return out;
}

/** Quiet meta under the guest — seat + which staff admitted. */
export function doorLogEntryMeta(
  entry: DoorLogEntry,
  staffLabel: string,
  voice: PassStaffVoice = 'admit'
): string {
  const by = staffLabel.trim() || entry.staffId;
  const verb = voice === 'redeem' ? 'Redeemed by' : 'Admitted by';
  const multi =
    entry.maxRedeems != null &&
    entry.maxRedeems > 1 &&
    entry.redeemCount != null
      ? ` · ${entry.redeemCount}/${entry.maxRedeems}`
      : '';
  return `${entry.seatLabel}${multi} · ${verb} ${by}`;
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
