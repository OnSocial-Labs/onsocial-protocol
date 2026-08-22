/**
 * Yearly OnSocial profile anniversary notifications.
 *
 * Source of truth: `profile_search.first_profile_timestamp` (nanoseconds from
 * the first indexed profile set). Emitted once per calendar year via
 * `dedupe_key = profile_anniversary:{accountId}:{year}`; safe to re-run.
 *
 * The notification worker calls `maybeEmitProfileAnniversaries` once per UTC
 * day (cursor in `notification_cursors`). Manual / cron: `run-profile-anniversary`.
 */

import type { Client } from 'pg';
import { logger } from '../../logger.js';

export const PROFILE_ANNIVERSARY_TYPE = 'profile_anniversary' as const;
export const PROFILE_ANNIVERSARY_CURSOR = 'profile_anniversary';
export const PROFILE_ANNIVERSARY_SOURCE = 'onsocial';

const APP_ID = 'default';
const DEFAULT_PAGE_SIZE = 500;

export interface ProfileAnniversaryEmitOptions {
  /** Wall clock; defaults to now (UTC anniversary day). */
  now?: Date;
  /** Ignore the daily cursor (still respects per-account dedupe keys). */
  force?: boolean;
  pageSize?: number;
}

export interface ProfileAnniversaryEmitResult {
  utcDate: string;
  skipped: boolean;
  candidates: number;
  inserted: number;
}

export function utcDateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function isUtcLeapYear(year: number): boolean {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}

/** UTC month-day keys that celebrate today (Feb 28 also covers Feb 29 joiners in non-leap years). */
export function anniversaryMonthDayKeys(now: Date): string[] {
  const month = now.getUTCMonth() + 1;
  const day = now.getUTCDate();
  const key = `${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  if (month === 2 && day === 28 && !isUtcLeapYear(now.getUTCFullYear())) {
    return [key, '02-29'];
  }
  return [key];
}

export function utcMonthDayFromMs(ms: number): string {
  const date = new Date(ms);
  return `${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
}

/**
 * Convert indexed block timestamps to epoch ms.
 * Prefer nanoseconds (NEAR / substreams); also accept µs / ms / seconds.
 */
export function profileTimestampToMs(
  value: string | number | bigint | null | undefined
): number | null {
  if (value == null) return null;
  let n: number;
  if (typeof value === 'bigint') {
    if (value > BigInt(Number.MAX_SAFE_INTEGER)) {
      n = Number(value / 1_000_000n); // ns → ms via bigint
      return Number.isFinite(n) && n > 0 ? n : null;
    }
    n = Number(value);
  } else if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!/^\d+$/.test(trimmed)) return null;
    if (trimmed.length > 15) {
      try {
        n = Number(BigInt(trimmed) / 1_000_000n);
      } catch {
        return null;
      }
      return Number.isFinite(n) && n > 0 ? n : null;
    }
    n = Number(trimmed);
  } else {
    n = value;
  }
  if (!Number.isFinite(n) || n <= 0) return null;
  // Heuristic: ns ≥ 1e17, µs ≥ 1e14, ms ≥ 1e12, else seconds.
  if (n >= 1e17) return Math.floor(n / 1e6);
  if (n >= 1e14) return Math.floor(n / 1e3);
  if (n >= 1e12) return Math.floor(n);
  return Math.floor(n * 1000);
}

export function anniversaryYears(joinedMs: number, now: Date): number {
  const joined = new Date(joinedMs);
  return now.getUTCFullYear() - joined.getUTCFullYear();
}

export function formatAnniversaryAction(years: number): string {
  if (years === 1) return '1 year on OnSocial';
  return `${years} years on OnSocial`;
}

export function profileAnniversaryDedupeKey(
  accountId: string,
  calendarYear: number
): string {
  return `profile_anniversary:${accountId}:${calendarYear}`;
}

async function ensureAnniversaryCursor(client: Client): Promise<void> {
  await client.query(
    `
      INSERT INTO notification_cursors (source_table, last_block_height, last_event_id)
      VALUES ($1, 0, '')
      ON CONFLICT (source_table) DO NOTHING
    `,
    [PROFILE_ANNIVERSARY_CURSOR]
  );
}

async function readLastRunUtcDate(client: Client): Promise<string> {
  await ensureAnniversaryCursor(client);
  const result = await client.query<{ last_event_id: string }>(
    `
      SELECT last_event_id
      FROM notification_cursors
      WHERE source_table = $1
    `,
    [PROFILE_ANNIVERSARY_CURSOR]
  );
  return result.rows[0]?.last_event_id?.trim() ?? '';
}

async function writeLastRunUtcDate(
  client: Client,
  utcDate: string
): Promise<void> {
  await ensureAnniversaryCursor(client);
  await client.query(
    `
      UPDATE notification_cursors
      SET last_event_id = $2,
          last_processed_at = NOW()
      WHERE source_table = $1
    `,
    [PROFILE_ANNIVERSARY_CURSOR, utcDate]
  );
}

interface ProfileCandidateRow {
  account_id: string;
  first_profile_timestamp: string | number;
}

async function listAnniversaryCandidates(
  client: Client,
  monthDays: string[],
  afterAccountId: string | null,
  pageSize: number
): Promise<ProfileCandidateRow[]> {
  const result = await client.query<ProfileCandidateRow>(
    `
      SELECT account_id, first_profile_timestamp
      FROM profile_search
      WHERE first_profile_timestamp IS NOT NULL
        AND first_profile_timestamp > 0
        AND ($1::text IS NULL OR account_id > $1)
        AND to_char(
              timezone(
                'UTC',
                to_timestamp((first_profile_timestamp::numeric) / 1000000000.0)
              ),
              'MM-DD'
            ) = ANY($2::text[])
      ORDER BY account_id ASC
      LIMIT $3
    `,
    [afterAccountId, monthDays, pageSize]
  );
  return result.rows;
}

async function insertAnniversaryNotification(
  client: Client,
  input: {
    accountId: string;
    years: number;
    joinedMs: number;
    calendarYear: number;
    createdAt: Date;
  }
): Promise<boolean> {
  const dedupeKey = profileAnniversaryDedupeKey(
    input.accountId,
    input.calendarYear
  );
  const context = {
    years: input.years,
    accountId: input.accountId,
    joinedAt: new Date(input.joinedMs).toISOString(),
  };

  const result = await client.query<{ id: string }>(
    `
      INSERT INTO notifications (
        owner_account_id,
        app_id,
        recipient,
        actor,
        notification_type,
        source_contract,
        source_receipt_id,
        source_block_height,
        dedupe_key,
        context,
        created_at
      ) VALUES (
        $1, $2, $3, '', $4,
        $5, NULL, NULL,
        $6, $7::jsonb, $8
      )
      ON CONFLICT (owner_account_id, app_id, dedupe_key) DO NOTHING
      RETURNING id
    `,
    [
      input.accountId,
      APP_ID,
      input.accountId,
      PROFILE_ANNIVERSARY_TYPE,
      PROFILE_ANNIVERSARY_SOURCE,
      dedupeKey,
      JSON.stringify(context),
      input.createdAt.toISOString(),
    ]
  );

  return Boolean(result.rows[0]?.id);
}

/**
 * Emit anniversary rows for the UTC calendar day of `now`.
 * Idempotent via daily cursor + per-account/year dedupe keys.
 */
export async function emitProfileAnniversaries(
  client: Client,
  options: ProfileAnniversaryEmitOptions = {}
): Promise<ProfileAnniversaryEmitResult> {
  const now = options.now ?? new Date();
  const utcDate = utcDateKey(now);
  const force = options.force === true;
  const pageSize = options.pageSize ?? DEFAULT_PAGE_SIZE;

  if (!force) {
    const lastRun = await readLastRunUtcDate(client);
    if (lastRun === utcDate) {
      return {
        utcDate,
        skipped: true,
        candidates: 0,
        inserted: 0,
      };
    }
  }

  const monthDays = anniversaryMonthDayKeys(now);
  const calendarYear = now.getUTCFullYear();
  let afterAccountId: string | null = null;
  let candidates = 0;
  let inserted = 0;

  for (;;) {
    const rows = await listAnniversaryCandidates(
      client,
      monthDays,
      afterAccountId,
      pageSize
    );
    if (rows.length === 0) break;

    for (const row of rows) {
      const accountId = row.account_id?.trim();
      if (!accountId) continue;

      const joinedMs = profileTimestampToMs(row.first_profile_timestamp);
      if (joinedMs == null) continue;

      // Belt-and-suspenders vs SQL MM-DD (timezone / leap edge cases).
      if (!monthDays.includes(utcMonthDayFromMs(joinedMs))) continue;

      const years = anniversaryYears(joinedMs, now);
      if (years < 1) continue;

      candidates += 1;
      const didInsert = await insertAnniversaryNotification(client, {
        accountId,
        years,
        joinedMs,
        calendarYear,
        createdAt: now,
      });
      if (didInsert) inserted += 1;
    }

    afterAccountId = rows[rows.length - 1]?.account_id ?? null;
    if (rows.length < pageSize || !afterAccountId) break;
  }

  await writeLastRunUtcDate(client, utcDate);

  logger.info(
    {
      utcDate,
      monthDays,
      candidates,
      inserted,
      force,
    },
    'Profile anniversary emit complete'
  );

  return {
    utcDate,
    skipped: false,
    candidates,
    inserted,
  };
}

/**
 * Worker hook: run at most once per UTC day; never throw into the poll loop.
 */
export async function maybeEmitProfileAnniversaries(
  client: Client,
  options: ProfileAnniversaryEmitOptions = {}
): Promise<ProfileAnniversaryEmitResult | null> {
  try {
    return await emitProfileAnniversaries(client, options);
  } catch (error) {
    logger.error({ error }, 'Profile anniversary emit failed');
    return null;
  }
}
