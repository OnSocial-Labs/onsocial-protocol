/**
 * Periodic rebuild of `post_amplify_heat_state` from the live decay formula.
 *
 * Hot feed reads that table. A SQL insert trigger adds a new boost's heat
 * immediately; this job only replaces the table so older boosts fade.
 * The notification worker calls `maybeRefreshAmplifyHeat` on every wake;
 * the interval guard keeps the rebuild at ~5 minutes (36h half-life ⇒
 * ≤0.2% decay drift per cycle).
 */

import type { Client } from 'pg';
import { logger } from '../../logger.js';

export const AMPLIFY_HEAT_REFRESH_FN = 'refresh_post_amplify_heat';
export const AMPLIFY_HEAT_REFRESH_INTERVAL_MS = 5 * 60 * 1000;

let lastAttemptMs = 0;

/** Test hook — clears the interval guard. */
export function resetAmplifyHeatRefreshState(): void {
  lastAttemptMs = 0;
}

export interface AmplifyHeatRefreshResult {
  /** True when the interval guard or a missing function short-circuited. */
  skipped: boolean;
  refreshed: boolean;
}

export async function maybeRefreshAmplifyHeat(
  client: Client,
  options: { now?: Date; force?: boolean } = {}
): Promise<AmplifyHeatRefreshResult> {
  const nowMs = (options.now ?? new Date()).getTime();
  if (
    !options.force &&
    nowMs - lastAttemptMs < AMPLIFY_HEAT_REFRESH_INTERVAL_MS
  ) {
    return { skipped: true, refreshed: false };
  }
  lastAttemptMs = nowMs;

  const exists = await client.query<{ proc: string | null }>(
    `SELECT to_regprocedure('public.${AMPLIFY_HEAT_REFRESH_FN}()') AS proc`
  );
  if (!exists.rows[0]?.proc) {
    // Heat write-through is not deployed on this database yet.
    return { skipped: true, refreshed: false };
  }

  const startedAt = Date.now();
  await client.query(`SELECT ${AMPLIFY_HEAT_REFRESH_FN}()`);
  logger.debug(
    { fn: AMPLIFY_HEAT_REFRESH_FN, durationMs: Date.now() - startedAt },
    'Amplify heat snapshot refreshed'
  );
  return { skipped: false, refreshed: true };
}
